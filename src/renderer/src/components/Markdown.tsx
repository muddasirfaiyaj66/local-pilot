import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function openExternal(url: string): void {
  void window.localpilot.openExternal(url)
}

/** Assistant/markdown renderer: GFM, external links, code blocks. */
export function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="lp-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href ?? '#'}
              onClick={(e) => {
                e.preventDefault()
                if (href) openExternal(href)
              }}
            >
              {children}
            </a>
          ),
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className ?? '')
            return isBlock ? (
              <code className={className} {...rest}>
                {children}
              </code>
            ) : (
              <code className="lp-md-inline-code" {...rest}>
                {children}
              </code>
            )
          }
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
