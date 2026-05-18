export function StatusMessages({ error, message }) {
  return (
    <>
      {message && <p className="status-message">{message}</p>}
      {error && <p className="status-error">{error}</p>}
    </>
  );
}
