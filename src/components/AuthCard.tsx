export function AuthCard({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="mx-auto mt-12 max-w-sm space-y-3">
      <div className="card space-y-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </div>
      {note && <p className="text-center text-sm text-muted">{note}</p>}
    </div>
  );
}

export function Field({ label, ...input }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input className="input" {...input} />
    </label>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-sm text-danger" role="alert">
      {message}
    </p>
  );
}
