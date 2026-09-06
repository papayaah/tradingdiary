declare module 'ai' {
  export const jsonSchema: typeof import('@ai-sdk/provider-utils').jsonSchema;
  export const tool: typeof import('@ai-sdk/provider-utils').tool;
  export function stepCountIs(stepCount: number): (options: unknown) => boolean | PromiseLike<boolean>;
}
