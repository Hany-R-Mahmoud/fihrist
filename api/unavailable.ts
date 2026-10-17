export default function handler(_req: unknown, res: {
  status: (code: number) => { json: (data: unknown) => void };
  setHeader: (name: string, value: string) => void;
}) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(503).json({ error: "cloud-library-not-ready", message: "Fihrist cloud library API is not yet available." });
}
