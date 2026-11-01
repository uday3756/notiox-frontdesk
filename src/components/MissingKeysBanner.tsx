export function MissingKeysBanner({ keys }: { keys: string[] }) {
  if (!keys.length) return null
  return (
    <div className="nx-callout nx-animate-in" style={{ marginBottom: '1rem' }}>
      <strong>Supabase not fully configured</strong>
      UI can still be reviewed locally. Needed to go live:
      <ul style={{ margin: '0.45rem 0 0', paddingLeft: '1.1rem' }}>
        {keys.map((k) => (
          <li key={k}>
            <code>{k}</code>
          </li>
        ))}
      </ul>
    </div>
  )
}
