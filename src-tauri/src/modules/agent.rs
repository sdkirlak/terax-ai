use crate::modules::agent_providers::{
    provider_by_id, AgentProvider, ProviderIntegration, AGENT_PROVIDERS,
};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::{
    fs,
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
};

const HOOK_EVENTS: [(&str, &str); 3] = [
    ("UserPromptSubmit", "working"),
    ("Notification", "attention"),
    ("Stop", "finished"),
];

const CODEX_HOOK_EVENTS: [(&str, &str); 3] = [
    ("UserPromptSubmit", "working"),
    ("PermissionRequest", "attention"),
    ("Stop", "finished"),
];

// Includes the pre-v2.1.139 /dev/tty variant so re-running migrates it.
const OWNED_MARKERS: [&str; 2] = ["notify;Terax;", "terax;notify"];
const CODEX_MARKER_PREFIX: &str = "notify;Terax;codex;";
const OPENCODE_MARKER_PREFIX: &str = "notify;Terax;opencode;";
const PI_MARKER_PREFIX: &str = "notify;Terax;pi;";
const HERMES_MARKER_PREFIX: &str = "notify;Terax;hermes;";
const ANTIGRAVITY_MARKER_PREFIX: &str = "notify;Terax;antigravity;";

const OPENCODE_PLUGIN_VERSION: &str = "terax-opencode-plugin-v2";
const PI_EXTENSION_VERSION: &str = "terax-pi-extension-v1";
const HERMES_PLUGIN_VERSION: &str = "terax-hermes-plugin-v1";
const ANTIGRAVITY_HOOKS_VERSION: &str = "terax-antigravity-hooks-v2";
const TERAX_AGENT_STATE_GROUP: &str = "terax-agent-state";
const ANTIGRAVITY_INTERACTION_MATCHER: &str = "ask_question|ask_permission";

#[derive(Clone, Debug)]
struct ProviderHookPaths {
    claude_settings: PathBuf,
    codex_hooks: PathBuf,
    opencode_plugin: PathBuf,
    pi_extension: PathBuf,
    hermes_config: PathBuf,
    antigravity_hooks: PathBuf,
}

fn default_provider_hook_paths() -> Result<ProviderHookPaths, String> {
    let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;

    Ok(ProviderHookPaths {
        claude_settings: home.join(".claude").join("settings.json"),
        codex_hooks: home.join(".codex").join("hooks.json"),
        opencode_plugin: home
            .join(".config")
            .join("opencode")
            .join("plugins")
            .join("terax-agent-state.js"),
        pi_extension: home
            .join(".pi")
            .join("agent")
            .join("extensions")
            .join("terax-agent-state.ts"),
        hermes_config: home.join(".hermes").join("config.yaml"),
        antigravity_hooks: home.join(".gemini").join("config").join("hooks.json"),
    })
}

fn settings_path() -> Result<PathBuf, String> {
    Ok(default_provider_hook_paths()?.claude_settings)
}

// Gated on TERAX_TERMINAL; no-op outside Terax. Returns the sequence via
// `terminalSequence` because hooks lost /dev/tty access in v2.1.139.
fn hook_cmd(event: &str) -> String {
    format!(
        r#"[ -n "$TERAX_TERMINAL" ] && printf '{{"terminalSequence":"\\u001b]777;notify;Terax;{event}\\u0007"}}' || true; cat >/dev/null || true"#
    )
}

fn codex_hook_cmd(event: &str) -> String {
    format!(
        r#"[ -n "$TERAX_TERMINAL" ] && printf '\033]777;notify;Terax;codex;{event}\007' > /dev/tty || true; cat >/dev/null || true"#
    )
}

fn codex_hook_cmd_windows(event: &str) -> String {
    format!(
        r#"powershell -NoProfile -Command "if ($env:TERAX_TERMINAL) {{ $s = [string][char]27 + ']777;notify;Terax;codex;{event}' + [string][char]7; $bytes = [System.Text.Encoding]::UTF8.GetBytes($s); $out = [System.IO.File]::OpenWrite('\\.\CONOUT$'); try {{ $out.Write($bytes, 0, $bytes.Length) }} finally {{ $out.Dispose() }} }}; $null = [Console]::In.ReadToEnd()""#
    )
}

fn antigravity_emit_cmd(event: &str) -> String {
    format!(
        r#"[ -n "$TERAX_TERMINAL" ] && printf '\033]777;notify;Terax;antigravity;{event}\007' > /dev/tty 2>/dev/null || true; cat >/dev/null || true; printf '{{}}'"#
    )
}

fn antigravity_stop_cmd() -> String {
    r#"input=$(cat); if printf '%s' "$input" | grep -Eq '"fullyIdle"[[:space:]]*:[[:space:]]*true'; then [ -n "$TERAX_TERMINAL" ] && printf '\033]777;notify;Terax;antigravity;finished\007' > /dev/tty 2>/dev/null || true; fi; printf '{}'"#.to_string()
}

fn value_contains_any_marker(value: &Value, markers: &[&str]) -> bool {
    match value {
        Value::String(s) => markers.iter().any(|marker| s.contains(marker)),
        Value::Array(items) => items
            .iter()
            .any(|item| value_contains_any_marker(item, markers)),
        Value::Object(obj) => obj
            .values()
            .any(|item| value_contains_any_marker(item, markers)),
        _ => false,
    }
}

// A group with no hooks is inert cruft (e.g. left behind when someone deletes
// our command but not its wrapper). Drop it so the file stays clean.
fn is_empty_group(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(Value::as_array)
        .is_none_or(|hs| hs.is_empty())
}

fn hooks_object(root: &mut Value) -> &mut Map<String, Value> {
    if !root.is_object() {
        *root = json!({});
    }
    let obj = root.as_object_mut().unwrap();
    let hooks = obj.entry("hooks").or_insert_with(|| json!({}));
    if !hooks.is_object() {
        *hooks = json!({});
    }
    hooks.as_object_mut().unwrap()
}

fn merge_json_hooks(mut root: Value, hooks_to_add: &[(&str, String)], markers: &[&str]) -> Value {
    let hooks = hooks_object(&mut root);

    for (event, command) in hooks_to_add {
        let arr = hooks.entry(*event).or_insert_with(|| json!([]));
        if !arr.is_array() {
            *arr = json!([]);
        }
        let arr = arr.as_array_mut().unwrap();
        for group in arr.iter_mut() {
            prune_group_markers(group, markers);
        }
        arr.retain(|group| !is_empty_group(group));
        arr.push(json!({
            "hooks": [ { "type": "command", "command": command } ]
        }));
    }
    root
}

fn prune_group_markers(group: &mut Value, markers: &[&str]) {
    let Some(hooks) = group.get_mut("hooks").and_then(Value::as_array_mut) else {
        return;
    };
    hooks.retain(|hook| !value_contains_any_marker(hook, markers));
}

fn merge_hooks(root: Value) -> Value {
    let hooks = HOOK_EVENTS
        .iter()
        .map(|(event, marker)| (*event, hook_cmd(marker)))
        .collect::<Vec<_>>();
    merge_json_hooks(root, &hooks, &OWNED_MARKERS)
}

fn codex_merge_hooks(root: Value) -> Value {
    let mut root = root;
    let hooks = hooks_object(&mut root);

    for (event, marker) in CODEX_HOOK_EVENTS {
        let arr = hooks.entry(event).or_insert_with(|| json!([]));
        if !arr.is_array() {
            *arr = json!([]);
        }
        let arr = arr.as_array_mut().unwrap();
        for group in arr.iter_mut() {
            prune_group_markers(group, &[CODEX_MARKER_PREFIX]);
        }
        arr.retain(|group| !is_empty_group(group));
        arr.push(json!({
            "hooks": [ {
                "type": "command",
                "command": codex_hook_cmd(marker),
                "commandWindows": codex_hook_cmd_windows(marker)
            } ]
        }));
    }

    root
}

fn remove_json_hooks(mut root: Value, markers: &[&str]) -> Value {
    let Some(obj) = root.as_object_mut() else {
        return root;
    };
    let Some(hooks) = obj.get_mut("hooks").and_then(Value::as_object_mut) else {
        return root;
    };

    let events = hooks.keys().cloned().collect::<Vec<_>>();
    for event in events {
        if let Some(arr) = hooks.get_mut(&event).and_then(Value::as_array_mut) {
            for group in arr.iter_mut() {
                prune_group_markers(group, markers);
            }
            arr.retain(|group| !is_empty_group(group));
        }

        if hooks
            .get(&event)
            .and_then(Value::as_array)
            .is_some_and(Vec::is_empty)
        {
            hooks.remove(&event);
        }
    }

    if hooks.is_empty() {
        obj.remove("hooks");
    }

    root
}

fn json_hooks_have_command_fragments(root: &Value, event: &str, fragments: &[&str]) -> bool {
    root.get("hooks")
        .and_then(|hooks| hooks.get(event))
        .and_then(Value::as_array)
        .is_some_and(|groups| {
            groups.iter().any(|group| {
                group
                    .get("hooks")
                    .and_then(Value::as_array)
                    .is_some_and(|hooks| {
                        hooks.iter().any(|hook| {
                            hook.get("command")
                                .and_then(Value::as_str)
                                .is_some_and(|command| {
                                    fragments.iter().all(|fragment| command.contains(fragment))
                                })
                        })
                    })
            })
        })
}

fn claude_hooks_are_current(root: &Value) -> bool {
    HOOK_EVENTS.iter().all(|(event, marker)| {
        let marker = format!("notify;Terax;{marker}");
        json_hooks_have_command_fragments(
            root,
            event,
            &[marker.as_str(), "terminalSequence", "cat >/dev/null"],
        )
    })
}

fn codex_hooks_are_current(root: &Value) -> bool {
    CODEX_HOOK_EVENTS.iter().all(|(event, marker)| {
        let marker = format!("{CODEX_MARKER_PREFIX}{marker}");
        root.get("hooks")
            .and_then(|hooks| hooks.get(*event))
            .and_then(Value::as_array)
            .is_some_and(|groups| {
                groups.iter().any(|group| {
                    group
                        .get("hooks")
                        .and_then(Value::as_array)
                        .is_some_and(|hooks| {
                            hooks.iter().any(|hook| {
                                hook.get("command")
                                    .and_then(Value::as_str)
                                    .is_some_and(|command| {
                                        command.contains(&marker)
                                            && command.contains("cat >/dev/null")
                                    })
                                    && hook
                                        .get("commandWindows")
                                        .and_then(Value::as_str)
                                        .is_some_and(|command| {
                                            command.contains(&marker)
                                                && command.contains("CONOUT")
                                                && command.contains("ReadToEnd")
                                        })
                            })
                        })
                })
            })
    })
}

fn antigravity_group() -> Value {
    json!({
        TERAX_AGENT_STATE_GROUP: {
            "enabled": true,
            "version": ANTIGRAVITY_HOOKS_VERSION,
            "PreInvocation": [
                { "type": "command", "command": antigravity_emit_cmd("working") }
            ],
            "PreToolUse": [
                {
                    "matcher": ANTIGRAVITY_INTERACTION_MATCHER,
                    "hooks": [
                        { "type": "command", "command": antigravity_emit_cmd("attention") }
                    ]
                }
            ],
            "PostToolUse": [
                {
                    "matcher": ANTIGRAVITY_INTERACTION_MATCHER,
                    "hooks": [
                        { "type": "command", "command": antigravity_emit_cmd("working") }
                    ]
                }
            ],
            "Stop": [
                { "type": "command", "command": antigravity_stop_cmd() }
            ]
        }
    })
}

fn antigravity_merge_hooks(mut root: Value) -> Result<Value, String> {
    if !root.is_object() {
        root = json!({});
    }
    let obj = root.as_object_mut().unwrap();

    if let Some(existing) = obj.get(TERAX_AGENT_STATE_GROUP) {
        let markers = [ANTIGRAVITY_HOOKS_VERSION, ANTIGRAVITY_MARKER_PREFIX];
        if !value_contains_any_marker(existing, &markers) {
            return Err(format!(
                "{TERAX_AGENT_STATE_GROUP} exists but is not Terax-owned; refusing to overwrite"
            ));
        }
    }

    let group = antigravity_group()
        .as_object()
        .and_then(|obj| obj.get(TERAX_AGENT_STATE_GROUP))
        .cloned()
        .unwrap();
    obj.insert(TERAX_AGENT_STATE_GROUP.to_string(), group);
    Ok(root)
}

fn antigravity_remove_hooks(mut root: Value) -> Result<Value, String> {
    let Some(obj) = root.as_object_mut() else {
        return Ok(root);
    };
    let Some(existing) = obj.get(TERAX_AGENT_STATE_GROUP) else {
        return Ok(root);
    };

    let markers = [ANTIGRAVITY_HOOKS_VERSION, ANTIGRAVITY_MARKER_PREFIX];
    if !value_contains_any_marker(existing, &markers) {
        return Err(format!(
            "{TERAX_AGENT_STATE_GROUP} exists but is not Terax-owned; refusing to remove"
        ));
    }

    obj.remove(TERAX_AGENT_STATE_GROUP);
    Ok(root)
}

fn antigravity_hooks_are_current(root: &Value) -> bool {
    let Some(group) = root.get(TERAX_AGENT_STATE_GROUP) else {
        return false;
    };

    group.get("enabled") == Some(&Value::Bool(true))
        && value_contains_any_marker(group, &[ANTIGRAVITY_HOOKS_VERSION])
        && value_contains_any_marker(group, &[ANTIGRAVITY_INTERACTION_MATCHER])
        && value_contains_any_marker(group, &["fullyIdle"])
        && value_contains_any_marker(group, &["/dev/tty"])
        && value_contains_any_marker(group, &["cat >/dev/null"])
        && value_contains_any_marker(group, &["printf '{}'"])
        && value_contains_any_marker(
            group,
            &[
                "notify;Terax;antigravity;working",
                "notify;Terax;antigravity;attention",
                "notify;Terax;antigravity;finished",
            ],
        )
}

fn opencode_plugin_content() -> String {
    format!(
        r#"const TERAX_OPENCODE_PLUGIN_VERSION = "{OPENCODE_PLUGIN_VERSION}";
const TERAX_MARKERS = {{
  working: "{OPENCODE_MARKER_PREFIX}working",
  attention: "{OPENCODE_MARKER_PREFIX}attention",
  finished: "{OPENCODE_MARKER_PREFIX}finished",
}};

const TERAX_EVENT_WORKING = new Set([
  "permission.replied",
  "question.replied",
  "session.status",
  "tool.execute.before",
  "tool.execute.after",
]);

const TERAX_EVENT_ATTENTION = new Set([
  "permission.asked",
  "question.asked",
]);

const TERAX_EVENT_FINISHED = new Set([
  "session.idle",
  "question.rejected",
]);

function teraxEmit(event) {{
  process.stdout.write(`\x1b]777;${{TERAX_MARKERS[event]}}\x07`);
}}

export default async function TeraxAgentState() {{
  return {{
    name: "terax-agent-state",
    version: TERAX_OPENCODE_PLUGIN_VERSION,
    "permission.ask": async () => teraxEmit("attention"),
    "tool.execute.before": async () => teraxEmit("working"),
    "tool.execute.after": async () => teraxEmit("working"),
    event: async (input) => {{
      const type = input?.event?.type ?? input?.type;
      if (TERAX_EVENT_ATTENTION.has(type)) teraxEmit("attention");
      else if (TERAX_EVENT_WORKING.has(type)) teraxEmit("working");
      else if (TERAX_EVENT_FINISHED.has(type)) teraxEmit("finished");
    }},
  }};
}}
"#
    )
}

fn pi_extension_content() -> String {
    format!(
        r#"import type {{ ExtensionAPI }} from "@earendil-works/pi-coding-agent";

export const TERAX_PI_EXTENSION_VERSION = "{PI_EXTENSION_VERSION}";

const TERAX_MARKERS = {{
  working: "{PI_MARKER_PREFIX}working",
  finished: "{PI_MARKER_PREFIX}finished",
}};

function teraxEmit(event: keyof typeof TERAX_MARKERS): void {{
  process.stdout.write(`\x1b]777;${{TERAX_MARKERS[event]}}\x07`);
}}

export default function (pi: ExtensionAPI): void {{
  pi.on("agent_start", async () => teraxEmit("working"));
  pi.on("turn_start", async () => teraxEmit("working"));
  pi.on("message_start", async () => teraxEmit("working"));
  pi.on("message_update", async () => teraxEmit("working"));
  pi.on("tool_execution_start", async () => teraxEmit("working"));
  pi.on("tool_execution_update", async () => teraxEmit("working"));
  pi.on("tool_call", async () => teraxEmit("working"));
  pi.on("agent_end", async () => teraxEmit("finished"));
  pi.on("turn_end", async () => teraxEmit("finished"));
  pi.on("message_end", async () => teraxEmit("finished"));
  pi.on("tool_execution_end", async () => teraxEmit("finished"));
}}
"#
    )
}

#[cfg_attr(not(test), allow(dead_code))]
fn hermes_plugin_content() -> String {
    format!(
        r#"TERAX_HERMES_PLUGIN_VERSION = "{HERMES_PLUGIN_VERSION}"
PLUGIN_NAME = "terax-agent-state"

TERAX_MARKERS = {{
    "working": "{HERMES_MARKER_PREFIX}working",
    "attention": "{HERMES_MARKER_PREFIX}attention",
    "finished": "{HERMES_MARKER_PREFIX}finished",
}}

TERAX_ATTENTION_EVENTS = {{
    "pre_approval_request",
}}

TERAX_WORKING_EVENTS = {{
    "post_approval_response",
    "pre_tool_call",
    "post_tool_call",
    "pre_llm_call",
    "pre_gateway_dispatch",
    "on_session_start",
}}

TERAX_FINISHED_EVENTS = {{
    "post_llm_call",
    "on_session_end",
    "on_session_finalize",
    "on_session_reset",
    "subagent_stop",
}}

def terax_emit(event):
    import sys
    sys.stdout.write(f"\033]777;{{TERAX_MARKERS[event]}}\007")
    sys.stdout.flush()

def on_event(event_name, **_payload):
    if event_name in TERAX_ATTENTION_EVENTS:
        terax_emit("attention")
    elif event_name in TERAX_WORKING_EVENTS:
        terax_emit("working")
    elif event_name in TERAX_FINISHED_EVENTS:
        terax_emit("finished")
"#
    )
}

fn owned_content_is_current(content: &str, version: &str, marker_prefix: &str) -> bool {
    content.contains(version) && content.contains(marker_prefix)
}

fn existing_config(contents: Option<&str>, path: &Path) -> Result<Value, String> {
    match contents {
        Some(s) if !s.trim().is_empty() => serde_json::from_str::<Value>(s).map_err(|e| {
            format!(
                "{} is not valid JSON ({e}); refusing to overwrite",
                path.display()
            )
        }),
        _ => Ok(json!({})),
    }
}

fn read_json_or_empty(path: &Path) -> Result<Value, String> {
    match fs::read_to_string(path) {
        Ok(s) => existing_config(Some(&s), path),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(json!({})),
        Err(e) => Err(format!("read {}: {e}", path.display())),
    }
}

fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", path.display()))?;
    let mut tmp =
        tempfile::NamedTempFile::new_in(dir).map_err(|e| format!("create temp file: {e}"))?;
    tmp.as_file_mut()
        .write_all(content.as_bytes())
        .map_err(|e| format!("write temp file: {e}"))?;
    tmp.as_file_mut()
        .sync_all()
        .map_err(|e| format!("sync temp file: {e}"))?;
    tmp.persist(path)
        .map_err(|e| format!("rename into {}: {}", path.display(), e.error))?;
    Ok(())
}

fn write_json_atomic(path: &Path, value: &Value) -> Result<(), String> {
    let out = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    write_atomic(path, &out)
}

fn create_parent_dir(path: &Path) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", path.display()))?;
    fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))
}

fn enable_json_hooks_at(
    path: &Path,
    merge: impl FnOnce(Value) -> Result<Value, String>,
) -> Result<(), String> {
    create_parent_dir(path)?;
    let existing = read_json_or_empty(path)?;
    let merged = merge(existing)?;
    write_json_atomic(path, &merged)
}

fn disable_json_hooks_at(
    path: &Path,
    remove: impl FnOnce(Value) -> Result<Value, String>,
) -> Result<(), String> {
    let existing = match fs::read_to_string(path) {
        Ok(s) => existing_config(Some(&s), path)?,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };

    let removed = remove(existing)?;
    write_json_atomic(path, &removed)
}

fn install_owned_file(
    path: &Path,
    content: &str,
    version: &str,
    marker_prefix: &str,
) -> Result<(), String> {
    match fs::read_to_string(path) {
        Ok(existing) if !owned_content_is_current(&existing, version, marker_prefix) => {
            return Err(format!(
                "{} exists but is not Terax-owned; refusing to overwrite",
                path.display()
            ));
        }
        Ok(_) => {}
        Err(e) if e.kind() == ErrorKind::NotFound => {}
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    }

    create_parent_dir(path)?;
    write_atomic(path, content)
}

fn uninstall_owned_file(path: &Path, version: &str, marker_prefix: &str) -> Result<(), String> {
    let existing = match fs::read_to_string(path) {
        Ok(existing) => existing,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };

    if !owned_content_is_current(&existing, version, marker_prefix) {
        return Err(format!(
            "{} is not Terax-owned; refusing to remove",
            path.display()
        ));
    }

    fs::remove_file(path).map_err(|e| format!("remove {}: {e}", path.display()))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderReadiness {
    Ready,
    Missing,
    Unavailable,
    Error,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderStatus {
    pub id: String,
    pub label: String,
    pub aliases: Vec<String>,
    pub integration: String,
    pub experimental: bool,
    pub readiness: ProviderReadiness,
}

fn integration_label(integration: ProviderIntegration) -> &'static str {
    match integration {
        ProviderIntegration::ClaudeHooks => "claude-hooks",
        ProviderIntegration::CodexHooks => "codex-hooks",
        ProviderIntegration::OpenCodePlugin => "opencode-plugin",
        ProviderIntegration::PiExtension => "pi-extension",
        ProviderIntegration::HermesPlugin => "hermes-plugin",
        ProviderIntegration::AntigravityHooks => "antigravity-hooks",
    }
}

fn parent_exists(path: &Path) -> bool {
    path.parent().is_some_and(Path::exists)
}

fn json_provider_readiness_at(
    path: &Path,
    is_current: impl FnOnce(&Value) -> bool,
) -> ProviderReadiness {
    if !parent_exists(path) {
        return ProviderReadiness::Unavailable;
    }

    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(e) if e.kind() == ErrorKind::NotFound => return ProviderReadiness::Missing,
        Err(_) => return ProviderReadiness::Error,
    };

    let root = match existing_config(Some(&content), path) {
        Ok(root) => root,
        Err(_) => return ProviderReadiness::Error,
    };

    if is_current(&root) {
        ProviderReadiness::Ready
    } else {
        ProviderReadiness::Missing
    }
}

fn owned_file_readiness_at(path: &Path, version: &str, marker_prefix: &str) -> ProviderReadiness {
    if !parent_exists(path) {
        return ProviderReadiness::Unavailable;
    }

    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(e) if e.kind() == ErrorKind::NotFound => return ProviderReadiness::Missing,
        Err(_) => return ProviderReadiness::Error,
    };

    if owned_content_is_current(&content, version, marker_prefix) {
        ProviderReadiness::Ready
    } else {
        ProviderReadiness::Error
    }
}

fn readiness_for_provider_at(
    provider: &AgentProvider,
    paths: &ProviderHookPaths,
) -> ProviderReadiness {
    match provider.integration {
        ProviderIntegration::ClaudeHooks => {
            json_provider_readiness_at(&paths.claude_settings, claude_hooks_are_current)
        }
        ProviderIntegration::CodexHooks => {
            json_provider_readiness_at(&paths.codex_hooks, codex_hooks_are_current)
        }
        ProviderIntegration::OpenCodePlugin => owned_file_readiness_at(
            &paths.opencode_plugin,
            OPENCODE_PLUGIN_VERSION,
            OPENCODE_MARKER_PREFIX,
        ),
        ProviderIntegration::PiExtension => {
            owned_file_readiness_at(&paths.pi_extension, PI_EXTENSION_VERSION, PI_MARKER_PREFIX)
        }
        ProviderIntegration::HermesPlugin => ProviderReadiness::Unavailable,
        ProviderIntegration::AntigravityHooks => {
            json_provider_readiness_at(&paths.antigravity_hooks, antigravity_hooks_are_current)
        }
    }
}

fn provider_status_with_readiness(
    provider: &AgentProvider,
    readiness: ProviderReadiness,
) -> AgentProviderStatus {
    AgentProviderStatus {
        id: provider.id.to_string(),
        label: provider.label.to_string(),
        aliases: provider
            .aliases
            .iter()
            .map(|alias| (*alias).to_string())
            .collect(),
        integration: integration_label(provider.integration).to_string(),
        experimental: provider.experimental,
        readiness,
    }
}

fn provider_status_at(provider: &AgentProvider, paths: &ProviderHookPaths) -> AgentProviderStatus {
    provider_status_with_readiness(provider, readiness_for_provider_at(provider, paths))
}

#[tauri::command]
pub fn agent_provider_readiness() -> Vec<AgentProviderStatus> {
    match default_provider_hook_paths() {
        Ok(paths) => AGENT_PROVIDERS
            .iter()
            .map(|provider| provider_status_at(provider, &paths))
            .collect(),
        Err(_) => AGENT_PROVIDERS
            .iter()
            .map(|provider| provider_status_with_readiness(provider, ProviderReadiness::Error))
            .collect(),
    }
}

fn hermes_unsupported_message(action: &str, path: &Path) -> String {
    format!(
        "Hermes hook {action} is unsupported because only {} is verified; the Hermes plugin install directory is not verified",
        path.display()
    )
}

fn agent_enable_provider_hooks_at(
    provider_id: &str,
    paths: &ProviderHookPaths,
) -> Result<(), String> {
    let provider = provider_by_id(provider_id)
        .ok_or_else(|| format!("unknown agent provider: {provider_id}"))?;

    match provider.integration {
        ProviderIntegration::ClaudeHooks => agent_enable_claude_hooks_at(&paths.claude_settings),
        ProviderIntegration::CodexHooks => {
            enable_json_hooks_at(&paths.codex_hooks, |root| Ok(codex_merge_hooks(root)))
        }
        ProviderIntegration::OpenCodePlugin => install_owned_file(
            &paths.opencode_plugin,
            &opencode_plugin_content(),
            OPENCODE_PLUGIN_VERSION,
            OPENCODE_MARKER_PREFIX,
        ),
        ProviderIntegration::PiExtension => install_owned_file(
            &paths.pi_extension,
            &pi_extension_content(),
            PI_EXTENSION_VERSION,
            PI_MARKER_PREFIX,
        ),
        ProviderIntegration::HermesPlugin => {
            Err(hermes_unsupported_message("install", &paths.hermes_config))
        }
        ProviderIntegration::AntigravityHooks => {
            enable_json_hooks_at(&paths.antigravity_hooks, antigravity_merge_hooks)
        }
    }
}

fn agent_disable_provider_hooks_at(
    provider_id: &str,
    paths: &ProviderHookPaths,
) -> Result<(), String> {
    let provider = provider_by_id(provider_id)
        .ok_or_else(|| format!("unknown agent provider: {provider_id}"))?;

    match provider.integration {
        ProviderIntegration::ClaudeHooks => disable_json_hooks_at(&paths.claude_settings, |root| {
            Ok(remove_json_hooks(root, &OWNED_MARKERS))
        }),
        ProviderIntegration::CodexHooks => disable_json_hooks_at(&paths.codex_hooks, |root| {
            Ok(remove_json_hooks(root, &[CODEX_MARKER_PREFIX]))
        }),
        ProviderIntegration::OpenCodePlugin => uninstall_owned_file(
            &paths.opencode_plugin,
            OPENCODE_PLUGIN_VERSION,
            OPENCODE_MARKER_PREFIX,
        ),
        ProviderIntegration::PiExtension => {
            uninstall_owned_file(&paths.pi_extension, PI_EXTENSION_VERSION, PI_MARKER_PREFIX)
        }
        ProviderIntegration::HermesPlugin => Err(hermes_unsupported_message(
            "uninstall",
            &paths.hermes_config,
        )),
        ProviderIntegration::AntigravityHooks => {
            disable_json_hooks_at(&paths.antigravity_hooks, antigravity_remove_hooks)
        }
    }
}

#[tauri::command]
pub fn agent_enable_provider_hooks(provider_id: String) -> Result<(), String> {
    let paths = default_provider_hook_paths()?;
    agent_enable_provider_hooks_at(&provider_id, &paths)
}

#[tauri::command]
pub fn agent_disable_provider_hooks(provider_id: String) -> Result<(), String> {
    let paths = default_provider_hook_paths()?;
    agent_disable_provider_hooks_at(&provider_id, &paths)
}

#[tauri::command]
pub fn agent_enable_claude_hooks() -> Result<(), String> {
    let path = settings_path()?;
    agent_enable_claude_hooks_at(&path)
}

fn agent_enable_claude_hooks_at(path: &Path) -> Result<(), String> {
    enable_json_hooks_at(path, |root| Ok(merge_hooks(root)))
}

#[tauri::command]
pub fn agent_claude_hooks_status() -> bool {
    let Ok(path) = settings_path() else {
        return false;
    };
    agent_claude_hooks_status_at(&path)
}

fn agent_claude_hooks_status_at(path: &Path) -> bool {
    json_provider_readiness_at(path, claude_hooks_are_current) == ProviderReadiness::Ready
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hook_count(root: &Value, event: &str) -> usize {
        root["hooks"][event].as_array().map_or(0, Vec::len)
    }

    fn command(root: &Value, event: &str, idx: usize) -> String {
        root["hooks"][event][idx]["hooks"][0]["command"]
            .as_str()
            .unwrap()
            .to_string()
    }

    #[test]
    fn adds_all_event_hooks_to_empty_config() {
        let out = merge_hooks(json!({}));
        assert_eq!(hook_count(&out, "UserPromptSubmit"), 1);
        assert_eq!(hook_count(&out, "Notification"), 1);
        assert_eq!(hook_count(&out, "Stop"), 1);
        assert!(command(&out, "Notification", 0).contains("notify;Terax;attention"));
        assert!(command(&out, "Stop", 0).contains("notify;Terax;finished"));
        assert!(command(&out, "UserPromptSubmit", 0).contains("notify;Terax;working"));
        assert!(command(&out, "Stop", 0).contains("terminalSequence"));
        assert!(!command(&out, "Stop", 0).contains("/dev/tty"));
    }

    #[test]
    fn is_idempotent() {
        let once = merge_hooks(json!({}));
        let twice = merge_hooks(once.clone());
        assert_eq!(once, twice);
        assert_eq!(hook_count(&twice, "Notification"), 1);
    }

    #[test]
    fn migrates_legacy_dev_tty_hook() {
        let legacy = json!({
            "hooks": {
                "Notification": [
                    { "hooks": [ {
                        "type": "command",
                        "command": "[ -n \"$TERAX_TERMINAL\" ] && printf '\\033]777;terax;notify\\033\\\\' > /dev/tty || true"
                    } ] }
                ]
            }
        });
        let out = merge_hooks(legacy);
        assert_eq!(hook_count(&out, "Notification"), 1);
        assert!(command(&out, "Notification", 0).contains("terminalSequence"));
        assert!(!command(&out, "Notification", 0).contains("/dev/tty"));
    }

    #[test]
    fn claude_hooks_drain_stdin_payloads() {
        let out = merge_hooks(json!({}));

        assert!(command(&out, "UserPromptSubmit", 0).contains("cat >/dev/null"));
        assert!(command(&out, "Notification", 0).contains("cat >/dev/null"));
        assert!(command(&out, "Stop", 0).contains("cat >/dev/null"));
    }

    #[test]
    fn claude_readiness_rejects_hooks_without_stdin_drain() {
        let stale = json!({
            "hooks": {
                "UserPromptSubmit": [
                    { "hooks": [ { "type": "command", "command": "[ -n \"$TERAX_TERMINAL\" ] && printf '{\"terminalSequence\":\"\\\\u001b]777;notify;Terax;working\\\\u0007\"}' || true" } ] }
                ],
                "Notification": [
                    { "hooks": [ { "type": "command", "command": "[ -n \"$TERAX_TERMINAL\" ] && printf '{\"terminalSequence\":\"\\\\u001b]777;notify;Terax;attention\\\\u0007\"}' || true" } ] }
                ],
                "Stop": [
                    { "hooks": [ { "type": "command", "command": "[ -n \"$TERAX_TERMINAL\" ] && printf '{\"terminalSequence\":\"\\\\u001b]777;notify;Terax;finished\\\\u0007\"}' || true" } ] }
                ]
            }
        });
        let current = merge_hooks(json!({}));

        assert!(!claude_hooks_are_current(&stale));
        assert!(claude_hooks_are_current(&current));
    }

    #[test]
    fn preserves_unrelated_settings_and_foreign_hooks() {
        let input = json!({
            "permissions": { "allow": ["Bash"] },
            "hooks": {
                "Notification": [
                    { "hooks": [ { "type": "command", "command": "say hi" } ] }
                ]
            }
        });
        let out = merge_hooks(input);
        assert_eq!(out["permissions"]["allow"][0], "Bash");
        assert_eq!(hook_count(&out, "Notification"), 2);
        assert_eq!(command(&out, "Notification", 0), "say hi");
    }

    #[test]
    fn replaces_non_object_root() {
        let out = merge_hooks(json!("garbage"));
        assert_eq!(hook_count(&out, "Notification"), 1);
    }

    #[test]
    fn prunes_empty_groups_and_collapses_duplicates() {
        let input = json!({
            "hooks": {
                "Notification": [
                    { "hooks": [] },
                    { "hooks": [ { "type": "command", "command": hook_cmd("attention") } ] }
                ]
            }
        });
        let out = merge_hooks(input);
        assert_eq!(hook_count(&out, "Notification"), 1);
        assert!(command(&out, "Notification", 0).contains("notify;Terax;attention"));
    }

    #[test]
    fn existing_config_absent_or_empty_starts_fresh() {
        let p = std::path::Path::new("/x/settings.json");
        assert_eq!(existing_config(None, p).unwrap(), json!({}));
        assert_eq!(existing_config(Some("   \n"), p).unwrap(), json!({}));
    }

    #[test]
    fn existing_config_refuses_to_clobber_invalid_json() {
        let p = std::path::Path::new("/x/settings.json");
        assert!(existing_config(Some("{ not json,"), p).is_err());
        assert_eq!(
            existing_config(Some(r#"{"permissions":{}}"#), p).unwrap(),
            json!({ "permissions": {} })
        );
    }

    fn test_paths(root: &std::path::Path) -> ProviderHookPaths {
        ProviderHookPaths {
            claude_settings: root.join(".claude").join("settings.json"),
            codex_hooks: root.join(".codex").join("hooks.json"),
            opencode_plugin: root
                .join(".config")
                .join("opencode")
                .join("plugins")
                .join("terax-agent-state.js"),
            pi_extension: root
                .join(".pi")
                .join("agent")
                .join("extensions")
                .join("terax-agent-state.ts"),
            hermes_config: root.join(".hermes").join("config.yaml"),
            antigravity_hooks: root.join(".gemini").join("config").join("hooks.json"),
        }
    }

    #[test]
    fn opencode_plugin_content_contains_verified_events_and_marker() {
        let content = opencode_plugin_content();

        assert!(content.contains("terax-opencode-plugin-v2"));
        assert!(content.contains("export default async function"));
        assert!(content.contains(r#""permission.ask":"#));
        assert!(content.contains(r#""tool.execute.before":"#));
        assert!(content.contains(r#""tool.execute.after":"#));
        assert!(content.contains("notify;Terax;opencode;attention"));
        assert!(content.contains("notify;Terax;opencode;working"));
    }

    #[test]
    fn antigravity_merge_uses_direct_group_event_keys() {
        let merged = antigravity_merge_hooks(json!({})).unwrap();
        let root = merged.get(TERAX_AGENT_STATE_GROUP).unwrap();
        let pre_tool_use = serde_json::to_string(&root["PreToolUse"]).unwrap();

        assert_eq!(root["enabled"], true);
        assert_eq!(root["version"], ANTIGRAVITY_HOOKS_VERSION);
        assert!(pre_tool_use.contains("ask_question|ask_permission"));
        assert!(pre_tool_use.contains("notify;Terax;antigravity;attention"));
        assert!(root.get("hooks").is_none());
    }

    #[test]
    fn pi_extension_content_contains_only_verified_states() {
        let content = pi_extension_content();

        assert!(content.contains("terax-pi-extension-v1"));
        assert!(content.contains("import type { ExtensionAPI }"));
        assert!(content.contains("export default function"));
        assert!(content.contains("pi.on(\"message_update\""));
        assert!(content.contains("agent_start"));
        assert!(content.contains("agent_end"));
        assert!(content.contains("message_update"));
        assert!(content.contains("notify;Terax;pi;working"));
        assert!(!content.contains("attention"));
        assert!(!content.contains("pi.on(\"update\""));
    }

    #[test]
    fn hermes_plugin_content_contains_verified_events_and_marker() {
        let content = hermes_plugin_content();

        assert!(content.contains("terax-hermes-plugin-v1"));
        assert!(content.contains("pre_approval_request"));
        assert!(content.contains("post_approval_response"));
        assert!(content.contains("notify;Terax;hermes;attention"));
    }

    #[test]
    fn codex_merge_uses_verified_hooks_only() {
        let merged = codex_merge_hooks(json!({}));
        let content = serde_json::to_string(&merged).unwrap();

        assert!(content.contains("UserPromptSubmit"));
        assert!(content.contains("PermissionRequest"));
        assert!(content.contains("Stop"));
        assert!(content.contains("notify;Terax;codex;working"));
        assert!(content.contains("notify;Terax;codex;attention"));
        assert!(content.contains("notify;Terax;codex;finished"));
        assert!(content.contains("commandWindows"));
        assert!(content.contains("CONOUT"));
        assert!(!content.contains("PreToolUse"));
    }

    #[test]
    fn codex_hooks_drain_stdin_payloads() {
        let merged = codex_merge_hooks(json!({}));
        let unix_command = command(&merged, "UserPromptSubmit", 0);
        let windows_command = merged["hooks"]["UserPromptSubmit"][0]["hooks"][0]["commandWindows"]
            .as_str()
            .unwrap();

        assert!(unix_command.contains("cat >/dev/null"));
        assert!(windows_command.contains("ReadToEnd"));
    }

    #[test]
    fn codex_readiness_rejects_hooks_without_stdin_drain() {
        let stale = json!({
            "hooks": {
                "UserPromptSubmit": [
                    { "hooks": [ {
                        "type": "command",
                        "command": "[ -n \"$TERAX_TERMINAL\" ] && printf '\\033]777;notify;Terax;codex;working\\007' > /dev/tty || true",
                        "commandWindows": "powershell -NoProfile -Command \"if ($env:TERAX_TERMINAL) { $s = [string][char]27 + ']777;notify;Terax;codex;working' + [string][char]7; $out = [System.IO.File]::OpenWrite('\\\\.\\CONOUT$') }\""
                    } ] }
                ],
                "PermissionRequest": [
                    { "hooks": [ {
                        "type": "command",
                        "command": "[ -n \"$TERAX_TERMINAL\" ] && printf '\\033]777;notify;Terax;codex;attention\\007' > /dev/tty || true",
                        "commandWindows": "powershell -NoProfile -Command \"if ($env:TERAX_TERMINAL) { $s = [string][char]27 + ']777;notify;Terax;codex;attention' + [string][char]7; $out = [System.IO.File]::OpenWrite('\\\\.\\CONOUT$') }\""
                    } ] }
                ],
                "Stop": [
                    { "hooks": [ {
                        "type": "command",
                        "command": "[ -n \"$TERAX_TERMINAL\" ] && printf '\\033]777;notify;Terax;codex;finished\\007' > /dev/tty || true",
                        "commandWindows": "powershell -NoProfile -Command \"if ($env:TERAX_TERMINAL) { $s = [string][char]27 + ']777;notify;Terax;codex;finished' + [string][char]7; $out = [System.IO.File]::OpenWrite('\\\\.\\CONOUT$') }\""
                    } ] }
                ]
            }
        });
        let current = codex_merge_hooks(json!({}));

        assert!(!codex_hooks_are_current(&stale));
        assert!(codex_hooks_are_current(&current));
    }

    #[test]
    fn codex_readiness_rejects_stale_unix_only_hooks() {
        let stale = json!({
            "hooks": {
                "UserPromptSubmit": [
                    { "hooks": [ { "type": "command", "command": codex_hook_cmd("working") } ] }
                ],
                "PermissionRequest": [
                    { "hooks": [ { "type": "command", "command": codex_hook_cmd("attention") } ] }
                ],
                "Stop": [
                    { "hooks": [ { "type": "command", "command": codex_hook_cmd("finished") } ] }
                ]
            }
        });
        let current = codex_merge_hooks(json!({}));

        assert!(!codex_hooks_are_current(&stale));
        assert!(codex_hooks_are_current(&current));
    }

    #[test]
    fn antigravity_commands_keep_stdout_json() {
        let merged = antigravity_merge_hooks(json!({})).unwrap();
        let root = merged.get(TERAX_AGENT_STATE_GROUP).unwrap();
        let pre_invocation = root["PreInvocation"][0]["command"].as_str().unwrap();
        let stop = root["Stop"][0]["command"].as_str().unwrap();

        assert!(pre_invocation.contains("/dev/tty"));
        assert!(pre_invocation.contains("cat >/dev/null"));
        assert!(pre_invocation.contains("printf '{}'"));
        assert!(stop.contains("fullyIdle"));
        assert!(stop.contains("/dev/tty"));
        assert!(stop.contains("printf '{}'"));
    }

    #[test]
    fn antigravity_readiness_rejects_stale_raw_stdout_hooks() {
        let stale = json!({
            TERAX_AGENT_STATE_GROUP: {
                "enabled": true,
                "version": ANTIGRAVITY_HOOKS_VERSION,
                "PreInvocation": [
                    { "type": "command", "command": "node -e 'process.stdout.write(\"\\x1b]777;notify;Terax;antigravity;working\\x07\")'" }
                ],
                "PreToolUse": [
                    {
                        "matcher": ANTIGRAVITY_INTERACTION_MATCHER,
                        "hooks": [
                            { "type": "command", "command": "node -e 'process.stdout.write(\"\\x1b]777;notify;Terax;antigravity;attention\\x07\")'" }
                        ]
                    }
                ],
                "Stop": [
                    { "type": "command", "command": "node -e 'let input=\"\";process.stdin.on(\"data\",d=>input+=d);process.stdin.on(\"end\",()=>{if(JSON.parse(input).fullyIdle){process.stdout.write(\"\\x1b]777;notify;Terax;antigravity;finished\\x07\")}})'" }
                ]
            }
        });
        let current = antigravity_merge_hooks(json!({})).unwrap();

        assert!(!antigravity_hooks_are_current(&stale));
        assert!(antigravity_hooks_are_current(&current));
    }

    #[test]
    fn antigravity_readiness_rejects_hooks_without_stdin_drain() {
        let current = antigravity_merge_hooks(json!({})).unwrap();
        let stale = serde_json::from_str::<Value>(
            &serde_json::to_string(&current)
                .unwrap()
                .replace("cat >/dev/null || true; ", ""),
        )
        .unwrap();

        assert!(!antigravity_hooks_are_current(&stale));
        assert!(antigravity_hooks_are_current(&current));
    }

    #[test]
    fn owned_file_uninstall_is_safe() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("terax-agent-state.js");

        uninstall_owned_file(&path, "terax-opencode-plugin-v2", "notify;Terax;opencode;").unwrap();

        std::fs::write(&path, "foreign plugin").unwrap();
        let err = uninstall_owned_file(&path, "terax-opencode-plugin-v2", "notify;Terax;opencode;")
            .unwrap_err();
        assert!(err.contains("refusing to remove"));
        assert!(path.exists());

        std::fs::write(&path, opencode_plugin_content()).unwrap();
        uninstall_owned_file(&path, "terax-opencode-plugin-v2", "notify;Terax;opencode;").unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn owned_file_install_refuses_foreign_file_at_owned_path() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("terax-agent-state.js");

        std::fs::write(&path, "foreign plugin").unwrap();
        let err = install_owned_file(
            &path,
            &opencode_plugin_content(),
            "terax-opencode-plugin-v2",
            "notify;Terax;opencode;",
        )
        .unwrap_err();

        assert!(err.contains("refusing to overwrite"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "foreign plugin");
    }

    #[test]
    fn json_hook_uninstall_preserves_foreign_entries() {
        let input = json!({
            "hooks": {
                "PermissionRequest": [
                    { "hooks": [ { "type": "command", "command": "say keep-me" } ] },
                    { "hooks": [ { "type": "command", "command": codex_hook_cmd("attention") } ] }
                ],
                "Stop": [
                    { "hooks": [ { "type": "command", "command": codex_hook_cmd("finished") } ] }
                ]
            },
            "theme": "dark"
        });

        let out = remove_json_hooks(input, &["notify;Terax;codex;"]);

        assert_eq!(out["theme"], "dark");
        assert_eq!(hook_count(&out, "PermissionRequest"), 1);
        assert_eq!(command(&out, "PermissionRequest", 0), "say keep-me");
        assert!(out["hooks"].get("Stop").is_none());
    }

    #[test]
    fn json_hook_uninstall_preserves_foreign_hooks_in_mixed_group() {
        let input = json!({
            "hooks": {
                "PermissionRequest": [
                    { "hooks": [
                        { "type": "command", "command": codex_hook_cmd("attention") },
                        { "type": "command", "command": "say keep-me" }
                    ] }
                ]
            }
        });

        let out = remove_json_hooks(input, &["notify;Terax;codex;"]);
        let hooks = out["hooks"]["PermissionRequest"][0]["hooks"]
            .as_array()
            .unwrap();

        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0]["command"], "say keep-me");
    }

    #[test]
    fn non_claude_enable_dispatch_uses_provider_adapter() {
        let dir = tempfile::tempdir().unwrap();
        let paths = test_paths(dir.path());

        agent_enable_provider_hooks_at("opencode", &paths).unwrap();

        let content = std::fs::read_to_string(&paths.opencode_plugin).unwrap();
        assert!(content.contains("terax-opencode-plugin-v2"));
        assert!(!content.contains("not implemented"));
    }

    #[test]
    fn hermes_enable_dispatch_documents_unverified_install_path() {
        let dir = tempfile::tempdir().unwrap();
        let paths = test_paths(dir.path());

        let err = agent_enable_provider_hooks_at("hermes", &paths).unwrap_err();

        assert!(err.contains("plugin install directory is not verified"));
        assert!(err.contains(".hermes"));
        assert!(!err.contains("not implemented"));
    }

    #[test]
    fn hermes_disable_dispatch_documents_unverified_install_path() {
        let dir = tempfile::tempdir().unwrap();
        let paths = test_paths(dir.path());

        let err = agent_disable_provider_hooks_at("hermes", &paths).unwrap_err();

        assert!(err.contains("plugin install directory is not verified"));
        assert!(err.contains("uninstall"));
        assert!(!err.contains("not implemented"));
    }

    #[test]
    fn hermes_readiness_is_unavailable_until_install_path_is_verified() {
        let dir = tempfile::tempdir().unwrap();
        let paths = test_paths(dir.path());
        std::fs::create_dir_all(paths.hermes_config.parent().unwrap()).unwrap();
        std::fs::write(&paths.hermes_config, "hooks: {}\n").unwrap();
        let provider = provider_by_id("hermes").unwrap();

        assert_eq!(
            readiness_for_provider_at(provider, &paths),
            ProviderReadiness::Unavailable
        );
    }

    mod agent_provider {
        use super::*;

        #[test]
        fn provider_readiness_lists_all_registry_providers() {
            let statuses = agent_provider_readiness();
            let ids = statuses
                .iter()
                .map(|status| status.id.as_str())
                .collect::<Vec<_>>();

            assert_eq!(
                ids,
                vec!["claude", "codex", "opencode", "pi", "hermes", "antigravity"]
            );

            let antigravity = statuses
                .iter()
                .find(|status| status.id == "antigravity")
                .unwrap();
            assert!(antigravity.experimental);
        }

        #[test]
        fn unknown_provider_enable_is_rejected() {
            let err = agent_enable_provider_hooks("grok".to_string()).unwrap_err();

            assert!(err.contains("unknown agent provider: grok"));
        }

        #[test]
        fn unknown_provider_disable_is_rejected() {
            let err = agent_disable_provider_hooks("grok".to_string()).unwrap_err();

            assert!(err.contains("unknown agent provider: grok"));
        }
    }
}
