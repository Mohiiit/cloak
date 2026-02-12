export class CloakError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "CloakError";
  }
}

export class WalletNotFoundError extends CloakError {
  constructor() {
    super("No wallet found. Create or import a wallet first.", "WALLET_NOT_FOUND");
    this.name = "WalletNotFoundError";
  }
}

export class InvalidKeyError extends CloakError {
  constructor(message = "Invalid private key") {
    super(message, "INVALID_KEY");
    this.name = "InvalidKeyError";
  }
}

export class AccountNotDeployedError extends CloakError {
  constructor() {
    super("Account not deployed on-chain. Deploy it first.", "ACCOUNT_NOT_DEPLOYED");
    this.name = "AccountNotDeployedError";
  }
}

export class InsufficientBalanceError extends CloakError {
  constructor(message = "Insufficient balance") {
    super(message, "INSUFFICIENT_BALANCE");
    this.name = "InsufficientBalanceError";
  }
}

export class TransactionFailedError extends CloakError {
  constructor(message: string) {
    super(message, "TX_FAILED");
    this.name = "TransactionFailedError";
  }
}
