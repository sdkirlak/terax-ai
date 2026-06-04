const ESC: u8 = 0x1b;
const BEL: u8 = 0x07;
const OSC_INTRO: u8 = b']';
const ST_FINAL: u8 = b'\\';

const OSC_MAX: usize = 2048;

// OSC 777 marker our Claude Code hooks emit via `terminalSequence`.
const TERAX_MARKER: &[u8] = b"notify;Terax;";

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum State {
    Ground,
    Esc,
    Osc,
    OscEsc,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Status {
    Idle,
    Working,
    Waiting,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Transition {
    Started { agent: String },
    Working,
    Attention,
    Finished,
    Exited,
}

#[derive(Clone, serde::Serialize)]
pub struct AgentSignal {
    pub id: u32,
    pub kind: &'static str,
    pub agent: Option<String>,
}

impl Transition {
    pub fn into_signal(self, id: u32) -> AgentSignal {
        match self {
            Transition::Started { agent } => AgentSignal {
                id,
                kind: "started",
                agent: Some(agent),
            },
            Transition::Working => AgentSignal {
                id,
                kind: "working",
                agent: None,
            },
            Transition::Attention => AgentSignal {
                id,
                kind: "attention",
                agent: None,
            },
            Transition::Finished => AgentSignal {
                id,
                kind: "finished",
                agent: None,
            },
            Transition::Exited => AgentSignal {
                id,
                kind: "exited",
                agent: None,
            },
        }
    }
}

pub struct AgentDetector {
    agents: Vec<String>,
    state: State,
    osc: Vec<u8>,
    armed: bool,
    status: Status,
}

impl AgentDetector {
    pub fn new() -> Self {
        Self::with_agents(crate::modules::agent_providers::detectable_provider_ids())
    }

    pub fn with_agents(agents: Vec<String>) -> Self {
        Self {
            agents,
            state: State::Ground,
            osc: Vec::new(),
            armed: false,
            status: Status::Idle,
        }
    }

    /// Feed a chunk of raw PTY output. Transitions come only from OSC sequences
    /// (`133` prompt boundaries, our `777` hook marker), never from raw output,
    /// so a TUI agent that repaints continuously never flaps working/waiting.
    pub fn process<F: FnMut(Transition)>(&mut self, input: &[u8], mut emit: F) {
        if self.state == State::Ground && !input.contains(&ESC) {
            return;
        }

        for &b in input {
            match self.state {
                State::Ground => {
                    if b == ESC {
                        self.state = State::Esc;
                    }
                }
                State::Esc => match b {
                    OSC_INTRO => {
                        self.state = State::Osc;
                        self.osc.clear();
                    }
                    ESC => {}
                    _ => self.state = State::Ground,
                },
                State::Osc => match b {
                    BEL => {
                        self.finish_osc(&mut emit);
                        self.state = State::Ground;
                    }
                    ESC => self.state = State::OscEsc,
                    _ => {
                        if self.osc.len() < OSC_MAX {
                            self.osc.push(b);
                        } else {
                            self.osc.clear();
                            self.state = State::Ground;
                        }
                    }
                },
                State::OscEsc => match b {
                    ST_FINAL => {
                        self.finish_osc(&mut emit);
                        self.state = State::Ground;
                    }
                    ESC => {}
                    _ => {
                        self.osc.clear();
                        self.state = State::Ground;
                    }
                },
            }
        }
    }

    /// Called when the underlying PTY closes. Reports the agent as exited so the
    /// UI doesn't leave a stale entry if the shell died mid-command.
    pub fn finish<F: FnMut(Transition)>(&mut self, mut emit: F) {
        if self.armed {
            self.disarm();
            emit(Transition::Exited);
        }
    }

    fn disarm(&mut self) {
        self.armed = false;
        self.status = Status::Idle;
    }

    fn finish_osc<F: FnMut(Transition)>(&mut self, emit: &mut F) {
        let body = std::mem::take(&mut self.osc);
        let (ps, pt) = match body.iter().position(|&c| c == b';') {
            Some(i) => (&body[..i], &body[i + 1..]),
            None => (&body[..], &body[0..0]),
        };
        match ps {
            b"133" => self.handle_osc133(pt, emit),
            // OSC 9;4 is taskbar progress, not a notification.
            b"9" if !pt.starts_with(b"4;") && pt != b"4" => self.generic_attention(emit),
            b"777" => self.handle_osc777(pt, emit),
            _ => {}
        }
    }

    fn handle_osc777<F: FnMut(Transition)>(&mut self, pt: &[u8], emit: &mut F) {
        if let Some(marker) = pt.strip_prefix(TERAX_MARKER) {
            self.handle_terax_marker(marker, emit);
            return;
        }
        self.generic_attention(emit);
    }

    fn handle_terax_marker<F: FnMut(Transition)>(&mut self, marker: &[u8], emit: &mut F) {
        match split_marker_provider(marker) {
            Some((provider, event)) => {
                let Some(agent) = self.resolve_marker_provider(provider) else {
                    return;
                };
                self.handle_terax_event(event, &agent, emit);
            }
            None => self.handle_terax_event(marker, "claude", emit),
        }
    }

    fn handle_terax_event<F: FnMut(Transition)>(
        &mut self,
        event: &[u8],
        agent: &str,
        emit: &mut F,
    ) {
        // Hook markers must work without shell preexec.
        match event {
            b"working" => {
                self.ensure_armed_as(agent, emit);
                self.set_working(emit);
            }
            b"attention" => {
                self.ensure_armed_as(agent, emit);
                self.status = Status::Waiting;
                emit(Transition::Attention);
            }
            b"finished" => {
                self.ensure_armed_as(agent, emit);
                self.status = Status::Waiting;
                emit(Transition::Finished);
            }
            _ => {}
        }
    }

    fn resolve_marker_provider(&self, provider: &[u8]) -> Option<String> {
        let provider = std::str::from_utf8(provider).ok()?;
        let provider = crate::modules::agent_providers::provider_by_id(provider)
            .or_else(|| crate::modules::agent_providers::provider_by_alias(provider))?;
        self.agents
            .iter()
            .any(|agent| agent == provider.id)
            .then(|| provider.id.to_string())
    }

    fn handle_osc133<F: FnMut(Transition)>(&mut self, pt: &[u8], emit: &mut F) {
        match pt.first() {
            Some(b'C') => {
                if self.armed {
                    return;
                }
                let cmd = pt.strip_prefix(b"C;").unwrap_or(b"");
                if let Some(agent) = self.match_agent(cmd) {
                    self.armed = true;
                    self.status = Status::Idle;
                    emit(Transition::Started { agent });
                }
            }
            Some(b'D') if self.armed => {
                self.disarm();
                emit(Transition::Exited);
            }
            _ => {}
        }
    }

    fn ensure_armed_as<F: FnMut(Transition)>(&mut self, agent: &str, emit: &mut F) {
        if !self.armed {
            self.armed = true;
            self.status = Status::Idle;
            emit(Transition::Started {
                agent: agent.into(),
            });
        }
    }

    fn set_working<F: FnMut(Transition)>(&mut self, emit: &mut F) {
        if self.status != Status::Working {
            self.status = Status::Working;
            emit(Transition::Working);
        }
    }

    fn generic_attention<F: FnMut(Transition)>(&mut self, emit: &mut F) {
        if self.armed {
            self.status = Status::Waiting;
            emit(Transition::Attention);
        }
    }

    fn match_agent(&self, cmd: &[u8]) -> Option<String> {
        let cmd = std::str::from_utf8(cmd).ok()?;
        let tokens = cmd.split_whitespace().collect::<Vec<_>>();
        self.match_agent_tokens(&tokens, 0)
    }

    fn match_agent_tokens(&self, tokens: &[&str], depth: usize) -> Option<String> {
        if depth > 4 {
            return None;
        }

        let tokens = skip_leading_assignments(tokens);
        let token = *tokens.first()?;
        let base = executable_base(token);

        if let Some(agent) = self.match_agent_executable(base) {
            return Some(agent);
        }

        let rest = &tokens[1..];
        let command_index = wrapper_command_index(base, rest)?;
        self.match_agent_tokens(&rest[command_index..], depth + 1)
    }

    fn match_agent_executable(&self, base: &str) -> Option<String> {
        for provider_id in &self.agents {
            let Some(provider) = crate::modules::agent_providers::provider_by_id(provider_id)
            else {
                continue;
            };
            for alias in provider.aliases {
                if base == *alias
                    || (provider.dash_suffix_aliases.contains(alias)
                        && base
                            .strip_prefix(*alias)
                            .is_some_and(|rest| rest.starts_with('-')))
                {
                    return Some(provider.id.to_string());
                }
            }
        }
        None
    }
}

fn executable_base(token: &str) -> &str {
    token.rsplit(['/', '\\']).next().unwrap_or(token)
}

fn split_marker_provider(marker: &[u8]) -> Option<(&[u8], &[u8])> {
    let index = marker.iter().position(|&c| c == b';')?;
    Some((&marker[..index], &marker[index + 1..]))
}

fn skip_leading_assignments<'a>(mut tokens: &'a [&'a str]) -> &'a [&'a str] {
    while tokens.first().is_some_and(|token| is_env_assignment(token)) {
        tokens = &tokens[1..];
    }
    tokens
}

fn wrapper_command_index(wrapper: &str, tokens: &[&str]) -> Option<usize> {
    match wrapper {
        "env" => env_command_index(tokens),
        "npx" | "uvx" => first_non_option_index(tokens),
        "npm" | "pnpm" | "bun" | "yarn" => package_manager_command_index(tokens),
        "cargo" => first_non_option_index(tokens),
        "mise" => mise_command_index(tokens),
        _ => None,
    }
}

fn package_manager_command_index(tokens: &[&str]) -> Option<usize> {
    let first = first_non_option_index(tokens)?;
    match executable_base(tokens[first]) {
        "dlx" | "exec" | "x" => first_non_option_index(&tokens[first + 1..])
            .map(|command_index| first + 1 + command_index),
        _ => Some(first),
    }
}

fn mise_command_index(tokens: &[&str]) -> Option<usize> {
    let first = first_non_option_index(tokens)?;
    match executable_base(tokens[first]) {
        "exec" | "x" => first_non_option_index(&tokens[first + 1..])
            .map(|command_index| first + 1 + command_index),
        _ => Some(first),
    }
}

fn env_command_index(tokens: &[&str]) -> Option<usize> {
    let mut index = 0;
    while let Some(token) = tokens.get(index) {
        if *token == "--" {
            return (index + 1 < tokens.len()).then_some(index + 1);
        }
        if is_env_assignment(token) {
            index += 1;
            continue;
        }
        if env_option_takes_value(token) {
            index += 2;
            continue;
        }
        if token.starts_with('-') {
            index += 1;
            continue;
        }
        return Some(index);
    }
    None
}

fn first_non_option_index(tokens: &[&str]) -> Option<usize> {
    let mut index = 0;
    while let Some(token) = tokens.get(index) {
        if *token == "--" {
            return (index + 1 < tokens.len()).then_some(index + 1);
        }
        if wrapper_option_takes_value(token) {
            index += 2;
            continue;
        }
        if token.starts_with('-') {
            index += 1;
            continue;
        }
        return Some(index);
    }
    None
}

fn wrapper_option_takes_value(token: &str) -> bool {
    matches!(
        token,
        "-p" | "--package"
            | "-c"
            | "--call"
            | "--cache"
            | "--registry"
            | "--userconfig"
            | "--cwd"
            | "-C"
            | "--filter"
            | "-F"
            | "--workspace"
            | "-w"
            | "--bin"
            | "-b"
    )
}

fn env_option_takes_value(token: &str) -> bool {
    matches!(token, "-u" | "--unset" | "-C" | "--chdir" | "-S")
}

fn is_env_assignment(token: &str) -> bool {
    let Some((name, _)) = token.split_once('=') else {
        return false;
    };
    let mut bytes = name.bytes();
    let Some(first) = bytes.next() else {
        return false;
    };
    (first == b'_' || first.is_ascii_alphabetic())
        && bytes.all(|byte| byte == b'_' || byte.is_ascii_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(d: &mut AgentDetector, input: &[u8]) -> Vec<Transition> {
        let mut out = Vec::new();
        d.process(input, |t| out.push(t));
        out
    }

    fn osc(body: &str) -> Vec<u8> {
        let mut v = vec![ESC, OSC_INTRO];
        v.extend_from_slice(body.as_bytes());
        v.extend_from_slice(&[ESC, ST_FINAL]);
        v
    }

    fn started(agent: &str) -> Transition {
        Transition::Started {
            agent: agent.into(),
        }
    }

    #[test]
    fn arms_on_agent_command() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("133;C;claude -p hello")),
            vec![started("claude")]
        );
    }

    #[test]
    fn arms_on_pathed_and_wrapped_command() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("133;C;/usr/local/bin/codex exec")),
            vec![started("codex")]
        );
        let mut d2 = AgentDetector::new();
        assert_eq!(
            run(&mut d2, &osc("133;C;npx claude")),
            vec![started("claude")]
        );
    }

    #[test]
    fn arms_on_dash_suffixed_alias() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("133;C;claude-enigma")),
            vec![started("claude")]
        );
    }

    #[test]
    fn arms_on_registry_provider_aliases() {
        let cases = [
            ("opencode", "opencode"),
            ("pi", "pi"),
            ("hermes", "hermes"),
            ("agy", "antigravity"),
            ("antigravity", "antigravity"),
        ];

        for (cmd, agent) in cases {
            let mut d = AgentDetector::new();
            assert_eq!(
                run(&mut d, &osc(&format!("133;C;{cmd}"))),
                vec![started(agent)]
            );
        }
    }

    #[test]
    fn pi_dash_suffix_does_not_arm() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &osc("133;C;pi-something")).is_empty());
    }

    #[test]
    fn provider_alias_arguments_do_not_arm() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &osc("133;C;cat pi")).is_empty());

        let mut d2 = AgentDetector::new();
        assert!(run(&mut d2, &osc("133;C;git checkout pi")).is_empty());

        let mut d3 = AgentDetector::new();
        assert!(run(&mut d3, &osc("133;C;grep pi file")).is_empty());
    }

    #[test]
    fn does_not_arm_on_other_commands() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &osc("133;C;vim src/main.rs")).is_empty());
        assert!(run(&mut d, &osc("133;C;cat claude.txt")).is_empty());
        assert!(run(&mut d, &osc("133;C;claudexyz")).is_empty());
    }

    #[test]
    fn ignores_bell_and_plain_output() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        assert!(run(&mut d, &[BEL]).is_empty());
        assert!(run(&mut d, b"thinking...\x07more").is_empty());
    }

    #[test]
    fn terax_marker_drives_status() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        assert_eq!(
            run(&mut d, &osc("777;notify;Terax;attention")),
            vec![Transition::Attention]
        );
        assert_eq!(
            run(&mut d, &osc("777;notify;Terax;working")),
            vec![Transition::Working]
        );
        assert!(run(&mut d, &osc("777;notify;Terax;working")).is_empty());
        assert_eq!(
            run(&mut d, &osc("777;notify;Terax;finished")),
            vec![Transition::Finished]
        );
    }

    #[test]
    fn working_marker_after_agent_launch_emits_working() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        assert_eq!(
            run(&mut d, &osc("777;notify;Terax;working")),
            vec![Transition::Working]
        );
    }

    #[test]
    fn terax_marker_auto_arms_without_preexec() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("777;notify;Terax;attention")),
            vec![started("claude"), Transition::Attention]
        );
    }

    #[test]
    fn qualified_terax_marker_auto_arms_provider_and_attention() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("777;notify;Terax;opencode;attention")),
            vec![started("opencode"), Transition::Attention]
        );
    }

    #[test]
    fn qualified_antigravity_marker_uses_canonical_provider_id() {
        for marker_provider in ["agy", "antigravity"] {
            let mut d = AgentDetector::new();
            assert_eq!(
                run(
                    &mut d,
                    &osc(&format!("777;notify;Terax;{marker_provider};attention"))
                ),
                vec![started("antigravity"), Transition::Attention]
            );
        }
    }

    #[test]
    fn qualified_marker_does_not_duplicate_started_when_already_armed() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("133;C;codex")),
            vec![started("codex")]
        );
        assert_eq!(
            run(&mut d, &osc("777;notify;Terax;codex;attention")),
            vec![Transition::Attention]
        );
    }

    #[test]
    fn unknown_qualified_marker_is_ignored_when_unarmed() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &osc("777;notify;Terax;grok;attention")).is_empty());
    }

    #[test]
    fn malformed_qualified_marker_keeps_unqualified_marker_compatibility() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &osc("777;notify;Terax;codex;")).is_empty());
        assert_eq!(
            run(&mut d, &osc("777;notify;Terax;attention")),
            vec![started("claude"), Transition::Attention]
        );
    }

    #[test]
    fn generic_osc777_and_osc9_attention_only_when_armed() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &osc("777;notify;Other;ready")).is_empty());
        run(&mut d, &osc("133;C;codex"));
        assert_eq!(
            run(&mut d, &osc("777;notify;Codex;ready")),
            vec![Transition::Attention]
        );
        assert_eq!(
            run(&mut d, &osc("9;needs you")),
            vec![Transition::Attention]
        );
        assert!(run(&mut d, &osc("9;4;1;50")).is_empty());
    }

    #[test]
    fn exits_on_133d() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        assert_eq!(run(&mut d, &osc("133;D;0")), vec![Transition::Exited]);
        assert!(run(&mut d, &osc("133;D;0")).is_empty());
    }

    #[test]
    fn bel_terminator_inside_osc_is_not_attention() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        let mut seq = vec![ESC, OSC_INTRO];
        seq.extend_from_slice(b"0;set title");
        seq.push(BEL);
        assert!(run(&mut d, &seq).is_empty());
    }

    #[test]
    fn started_split_across_chunks() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &[ESC, OSC_INTRO]).is_empty());
        assert!(run(&mut d, b"133;C;cla").is_empty());
        let mut out = run(&mut d, b"ude");
        out.extend(run(&mut d, &[ESC, ST_FINAL]));
        assert_eq!(out, vec![started("claude")]);
    }

    #[test]
    fn finish_reports_exited_when_armed() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        let mut out = Vec::new();
        d.finish(|t| out.push(t));
        assert_eq!(out, vec![Transition::Exited]);
        let mut out2 = Vec::new();
        d.finish(|t| out2.push(t));
        assert!(out2.is_empty());
    }

    #[test]
    fn oversized_osc_does_not_panic() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        let mut seq = vec![ESC, OSC_INTRO];
        seq.extend(std::iter::repeat_n(b'x', OSC_MAX + 100));
        seq.extend_from_slice(&[ESC, ST_FINAL]);
        assert!(run(&mut d, &seq).is_empty());
        assert_eq!(
            run(&mut d, &osc("777;notify;Terax;attention")),
            vec![Transition::Attention]
        );
    }
}
