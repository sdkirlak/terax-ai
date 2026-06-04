#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProviderIntegration {
    ClaudeHooks,
    CodexHooks,
    OpenCodePlugin,
    PiExtension,
    HermesPlugin,
    AntigravityHooks,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AgentProvider {
    pub id: &'static str,
    pub label: &'static str,
    pub aliases: &'static [&'static str],
    pub dash_suffix_aliases: &'static [&'static str],
    pub integration: ProviderIntegration,
    pub experimental: bool,
}

pub const AGENT_PROVIDERS: &[AgentProvider] = &[
    AgentProvider {
        id: "claude",
        label: "Claude Code",
        aliases: &["claude"],
        dash_suffix_aliases: &["claude"],
        integration: ProviderIntegration::ClaudeHooks,
        experimental: false,
    },
    AgentProvider {
        id: "codex",
        label: "Codex",
        aliases: &["codex"],
        dash_suffix_aliases: &["codex"],
        integration: ProviderIntegration::CodexHooks,
        experimental: false,
    },
    AgentProvider {
        id: "opencode",
        label: "OpenCode",
        aliases: &["opencode"],
        dash_suffix_aliases: &[],
        integration: ProviderIntegration::OpenCodePlugin,
        experimental: false,
    },
    AgentProvider {
        id: "pi",
        label: "Pi",
        aliases: &["pi"],
        dash_suffix_aliases: &[],
        integration: ProviderIntegration::PiExtension,
        experimental: false,
    },
    AgentProvider {
        id: "hermes",
        label: "Hermes Agent",
        aliases: &["hermes"],
        dash_suffix_aliases: &[],
        integration: ProviderIntegration::HermesPlugin,
        experimental: false,
    },
    AgentProvider {
        id: "antigravity",
        label: "Antigravity CLI",
        aliases: &["agy", "antigravity"],
        dash_suffix_aliases: &[],
        integration: ProviderIntegration::AntigravityHooks,
        experimental: true,
    },
];

pub fn provider_by_id(id: &str) -> Option<&'static AgentProvider> {
    AGENT_PROVIDERS.iter().find(|provider| provider.id == id)
}

pub fn provider_by_alias(alias: &str) -> Option<&'static AgentProvider> {
    AGENT_PROVIDERS
        .iter()
        .find(|provider| provider.aliases.contains(&alias))
}

pub fn provider_allows_dash_suffix(provider_id: &str, alias: &str) -> bool {
    provider_by_id(provider_id)
        .is_some_and(|provider| provider.dash_suffix_aliases.contains(&alias))
}

pub fn detectable_provider_ids() -> Vec<String> {
    AGENT_PROVIDERS
        .iter()
        .map(|provider| provider.id.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_contains_exact_target_provider_ids_and_antigravity_experimental_true() {
        let ids = AGENT_PROVIDERS
            .iter()
            .map(|provider| provider.id)
            .collect::<Vec<_>>();
        assert_eq!(
            ids,
            vec!["claude", "codex", "opencode", "pi", "hermes", "antigravity"]
        );

        assert!(provider_by_id("antigravity").is_some_and(|provider| provider.experimental));
        assert!(
            AGENT_PROVIDERS
                .iter()
                .filter(|provider| provider.id != "antigravity")
                .all(|provider| !provider.experimental)
        );
    }

    #[test]
    fn aliases_resolve_canonical_ids_and_reject_pi_dash_suffix() {
        assert_eq!(
            provider_by_alias("agy").map(|provider| provider.id),
            Some("antigravity")
        );
        assert_eq!(
            provider_by_alias("antigravity").map(|provider| provider.id),
            Some("antigravity")
        );
        assert_eq!(
            provider_by_alias("codex").map(|provider| provider.id),
            Some("codex")
        );
        assert_eq!(
            provider_by_alias("pi-something").map(|provider| provider.id),
            None
        );
    }

    #[test]
    fn dash_suffix_allowed_for_claude_and_codex_but_not_pi() {
        assert!(provider_allows_dash_suffix("claude", "claude"));
        assert!(provider_allows_dash_suffix("codex", "codex"));
        assert!(!provider_allows_dash_suffix("pi", "pi"));
    }
}
