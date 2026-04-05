export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export abstract class Tool<TInput = unknown, TOutput = unknown> {
  abstract name: string
  abstract description: string

  abstract call(input: TInput): Promise<ToolResult & { data?: TOutput }>
}
