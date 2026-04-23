import { OpenClawAdapter } from './openclaw'
import { GenericAdapter } from './generic'
import { CrewAIAdapter } from './crewai'
import { LangGraphAdapter } from './langgraph'
import { AutoGenAdapter } from './autogen'
import { ClaudeSdkAdapter } from './claude-sdk'
import type { FrameworkAdapter } from './adapter'

const adapters: Record<string, () => FrameworkAdapter> = {
  openclaw: () => new OpenClawAdapter(),
  generic: () => new GenericAdapter(),
  crewai: () => new CrewAIAdapter(),
  langgraph: () => new LangGraphAdapter(),
  autogen: () => new AutoGenAdapter(),
  'claude-sdk': () => new ClaudeSdkAdapter(),
}

export function getAdapter(framework: string): FrameworkAdapter {
  // Own-property lookup prevents descent into inherited keys like
  // toString or constructor that would otherwise return a function
  // and bypass the explicit allowlist below.
  if (!Object.prototype.hasOwnProperty.call(adapters, framework)) {
    throw new Error(`Unknown framework adapter: ${framework}`)
  }
  const factory = adapters[framework]
  return factory()
}

export function listAdapters(): string[] {
  return Object.keys(adapters)
}

export type { FrameworkAdapter, AgentRegistration, HeartbeatPayload, TaskReport, Assignment } from './adapter'
