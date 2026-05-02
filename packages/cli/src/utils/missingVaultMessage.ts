export function missingVaultMessage(resolvedPath: string): string {
  return (
    `no project memory found at ${resolvedPath} ` +
    "(run `cairndex init` for a legacy repo, " +
    "or `cairndex project register --vault <path> --project <id>` for a central vault)"
  );
}
