let mermaidPromise: Promise<any> | null = null;

export async function getMermaidInstance() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default || mod;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: 14,
        logLevel: 'error',
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
          // 增大自动折行阈值，优先以开发者显式书写的 <br/> 换行为准，杜绝 120px 窄宽导致的中英文乱折行与高度溢出
          wrappingWidth: 400,
          padding: 16,
          nodeSpacing: 50,
          rankSpacing: 50,
        },
        state: {
          wrappingWidth: 400,
        },
        themeVariables: {
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontSize: '14px',
          primaryTextColor: '#1e293b',
          lineColor: '#64748b',
        },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}
