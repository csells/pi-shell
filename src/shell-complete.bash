#!/bin/bash
# Capture bash completions for a partial command line.
# Fallback for systems without zsh.
#
# Usage: bash shell-complete.bash "git st"
# Output: one completion per line (e.g. "stash", "status")

INPUT="$1"
if [[ -z "$INPUT" ]]; then
    exit 0
fi

# Source bash completion if available
for f in /usr/share/bash-completion/bash_completion \
         /etc/bash_completion \
         /usr/local/etc/bash_completion \
         /opt/homebrew/etc/bash_completion; do
    [[ -f "$f" ]] && source "$f" 2>/dev/null && break
done

# Split input into words
read -ra COMP_WORDS <<< "$INPUT"
COMP_LINE="$INPUT"
COMP_POINT=${#INPUT}
COMP_CWORD=$(( ${#COMP_WORDS[@]} - 1 ))

# Ensure COMP_CWORD is at least 0
(( COMP_CWORD < 0 )) && COMP_CWORD=0

# Get the current word being completed
COMP_CURRENT="${COMP_WORDS[$COMP_CWORD]}"

# Try programmable completion first
CMD="${COMP_WORDS[0]}"
COMPREPLY=()

# Load completion for the command if available
_completion_loader "$CMD" 2>/dev/null

# Get the completion function
COMP_FUNC=$(complete -p "$CMD" 2>/dev/null | sed 's/.*-F \([^ ]*\).*/\1/')

if [[ -n "$COMP_FUNC" ]]; then
    # Call the registered completion function
    "$COMP_FUNC" "$CMD" "$COMP_CURRENT" "${COMP_WORDS[$((COMP_CWORD - 1))]}" 2>/dev/null
fi

# If no programmable completions, fall back to default
if [[ ${#COMPREPLY[@]} -eq 0 ]]; then
    if (( COMP_CWORD == 0 )); then
        # Complete command names
        mapfile -t COMPREPLY < <(compgen -c -- "$COMP_CURRENT" 2>/dev/null)
    else
        # Complete file paths
        mapfile -t COMPREPLY < <(compgen -f -- "$COMP_CURRENT" 2>/dev/null)
    fi
fi

# Output results
printf '%s\n' "${COMPREPLY[@]}" | head -50
