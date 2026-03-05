# Pi Shell

**The AI agent that *is* your shell.**

Pi Shell is a [pi](https://github.com/badlogic/pi-mono) extension that makes pi a first-class interactive shell — instant for shell commands, intelligent for natural language, seamless in between.

## The Problem

Today's AI-powered CLI tools all sit *on top of* or *beside* a traditional shell. They translate natural language into commands, suggest completions via hotkeys, or pipe output through an LLM. But none of them **replace** the shell itself.

Meanwhile, developers already live inside agents like pi for hours at a time, typing commands like `cd ..`, `git remote -v`, and `ls` — and the agent dutifully wraps them in `bash()` calls. We're effectively using pi as a shell already, just a very expensive, high-latency one with no completions.

Pi Shell closes that gap.

## Core Principle

> **Shell-first, agent-second.**
>
> Typing `ls` should feel instant and local — not round-trip through an LLM. But typing `"find all the test files that import the auth module"` should seamlessly engage the agent. The user never has to switch modes.

## Features (Planned)

### Shell Parity
- Tab completion (paths, commands, git branches)
- Glob, environment variable, and tilde expansion
- Pipelines and redirection (`|`, `>`, `>>`, `&&`, `||`)
- Persistent, searchable command history
- Aliases and shell functions
- Job control (`&`, Ctrl+Z, `fg`, `bg`)
- Customizable prompt with git status

### Agent Superpowers
- **Natural language fallback** — if input doesn't parse as a command, ask the agent
- **Explain mode** — `?? awk '{print $3}'` explains the command inline
- **Fix-on-fail** — command fails? Agent offers to diagnose and fix
- **Smart history** — `"that curl command from yesterday"` searches semantically
- **Pipeline builder** — `"get the top 10 largest node_modules"` builds and shows a pipeline

## Status

🚧 **Early design phase** — see [specs/vision.md](specs/vision.md) for the full design document.

## License

MIT
