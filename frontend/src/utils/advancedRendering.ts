import 'katex/dist/katex.min.css';

const jobs = new WeakMap<Element, Promise<unknown>>();
export function trackRender(element: Element, promise: Promise<unknown>) { jobs.set(element, promise); }
export async function settleRendering(root: Element): Promise<void> {
  // Embeds may create additional nested rendering jobs when their content arrives.
  for (let pass = 0; pass < 3; pass++) await Promise.all(Array.from(root.querySelectorAll('*')).map((element) => jobs.get(element)).filter(Boolean));
}
export function numberFootnotes(root: HTMLElement): void {
  const scope = root.dataset.footnoteScope ||= crypto.randomUUID();
  const numbers = new Map<string, number>();
  const references = Array.from(root.querySelectorAll<HTMLElement>('[data-footnote-reference]')).filter((element) => !element.closest('.vault-note-preview') || root.classList.contains('vault-note-preview'));
  references.forEach((element, index) => {
    const label = element.dataset.footnoteReference!;
    if (!numbers.has(label)) numbers.set(label, numbers.size + 1);
    element.id = `fn-ref-${scope}-${index}`;
    const button = element.querySelector('button'); if (button) button.textContent = String(numbers.get(label));
  });
  root.querySelectorAll<HTMLElement>('[data-footnote-definition]').forEach((element, index) => {
    if (element.closest('.vault-note-preview') && !root.classList.contains('vault-note-preview')) return;
    const label = element.dataset.footnoteDefinition!;
    element.id = `fn-def-${scope}-${index}`;
    const heading = element.querySelector('strong'); if (heading) heading.textContent = `[${numbers.get(label) || label}] `;
  });
}
let mermaidQueue: Promise<unknown> = Promise.resolve();
export function renderAdvanced(target: HTMLElement, kind: string, expression: string): void {
  target.dataset.renderState = 'loading'; target.textContent = 'Renderizando…';
  const task = (async () => {
    if (kind === 'math' || kind === 'mathBlock') {
      const { default: katex } = await import('katex');
      katex.render(expression, target, { displayMode: kind === 'mathBlock', throwOnError: true, trust: false, maxExpand: 1000, maxSize: 20, strict: 'warn' });
    } else if (kind === 'mermaid') {
      if (expression.length > 50000) throw new Error('El diagrama supera 50 000 caracteres');
      // Per-document configuration cannot relax the application's rendering contract.
      if (/%%\s*\{|^\s*---\s*\n/m.test(expression)) throw new Error('Los bloques de configuración Mermaid no se admiten en esta vista');
      const render = async () => {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', htmlLabels: false, flowchart: { htmlLabels: false }, suppressErrorRendering: true, maxTextSize: 50000, maxEdges: 1000 });
        const id = `jade-diagram-${crypto.randomUUID()}`;
        const { svg } = await mermaid.render(id, expression);
        // Render as an image document: SVG scripts and handlers cannot execute in the parent DOM.
        const image = document.createElement('img'); image.alt = 'Diagrama Mermaid'; image.className = 'mermaid-diagram max-w-full';
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        target.replaceChildren(image);
      };
      const pending = mermaidQueue.catch(() => {}).then(render); mermaidQueue = pending;
      await pending;
    }
    target.dataset.renderState = 'ready';
  })().catch((error) => {
    target.dataset.renderState = 'error'; target.setAttribute('role', 'alert');
    target.textContent = `No se pudo representar: ${error instanceof Error ? error.message : String(error)}`;
  });
  trackRender(target, task);
}
