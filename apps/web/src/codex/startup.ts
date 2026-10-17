/** The local runtime is restored once per Nexus login, never once per project. */
export class CodexStartup {
  private accountId: string | null = null;
  private attempted = false;

  operation(accountId: string | null): 'connect' | 'getState' {
    if (this.accountId !== accountId) {
      this.accountId = accountId;
      this.attempted = false;
    }
    if (accountId && !this.attempted) {
      this.attempted = true;
      return 'connect';
    }
    return 'getState';
  }
}
