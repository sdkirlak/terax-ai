# terax-shell-integration (bashrc)
#
# bash ignores --rcfile for login shells, so load profile files manually.
# DEBUG is used only when the user has no DEBUG trap.

if [ -z "$__TERAX_HOOKS_LOADED" ]; then
  __TERAX_HOOKS_LOADED=1

  [ -f /etc/profile ] && source /etc/profile
  [ -f /etc/bashrc ] && source /etc/bashrc
  if [ -f "$HOME/.bash_profile" ]; then
    source "$HOME/.bash_profile"
  elif [ -f "$HOME/.bash_login" ]; then
    source "$HOME/.bash_login"
  elif [ -f "$HOME/.profile" ]; then
    source "$HOME/.profile"
  fi
  # Most profiles either skip .bashrc or make it idempotent.
  [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"

  _terax_urlencode() {
    local LC_ALL=C s="$1" i c
    for (( i=0; i<${#s}; i++ )); do
      c="${s:i:1}"
      case "$c" in
        [a-zA-Z0-9/._~-]) printf '%s' "$c" ;;
        *) printf '%%%02X' "'$c" ;;
      esac
    done
  }

  _terax_precmd() {
    local _terax_ret=${1:-$?}
    printf '\e]133;D;%s\e\\' "$_terax_ret"
    printf '\e]7;file://%s%s\e\\' "${HOSTNAME:-$(uname -n 2>/dev/null)}" "$(_terax_urlencode "$PWD")"
    if [ -z "$__TERAX_PS1_INJECTED" ]; then
      PS1='\[\e]133;B\e\\\]'"$PS1"
      __TERAX_PS1_INJECTED=1
    fi
    printf '\e]133;A\e\\'
  }

  _terax_prompt_command() {
    local _terax_ret=$?
    __TERAX_IN_PROMPT=1
    _terax_precmd "$_terax_ret"
    __TERAX_IN_PROMPT=
    return "$_terax_ret"
  }

  case ":${PROMPT_COMMAND:-}:" in
    *":_terax_prompt_command:"*) ;;
    *) PROMPT_COMMAND="_terax_prompt_command${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
  esac

  # PS0 cannot capture the original command here; DEBUG can when unused.
  if [ -z "$(trap -p DEBUG)" ]; then
    _terax_preexec() {
      [ -n "$__TERAX_IN_PROMPT" ] && return
      local cmd="${1//$'\n'/ }"
      cmd="${cmd//$'\r'/ }"
      cmd="${cmd//$'\t'/ }"
      case "$cmd" in
        ""|_terax_*|__TERAX_*|local\ _terax_*|return\ *|trap\ *DEBUG*) return ;;
      esac
      printf '\e]133;C;%s\e\\' "${cmd:0:256}"
    }
    trap '_terax_preexec "$BASH_COMMAND"' DEBUG
  fi

  _terax_precmd "$?"
fi
:
