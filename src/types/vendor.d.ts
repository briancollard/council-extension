declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it';
  interface TexmathOptions {
    engine?: unknown;
    delimiters?: string[];
    katexOptions?: Record<string, unknown>;
  }
  const texmath: MarkdownIt.PluginWithOptions<TexmathOptions>;
  export default texmath;
}

declare module 'markdown-it-sup' {
  import type MarkdownIt from 'markdown-it';
  const markdownitSup: MarkdownIt.PluginSimple;
  export default markdownitSup;
}
