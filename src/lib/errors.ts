/**
 * An error whose message is written for the person using the app and is safe to show them
 * (errorResponse returns it with its status). Any other error becomes a generic 500.
 */
export class UserError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "UserError";
  }
}
