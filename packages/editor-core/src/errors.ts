export type AlgorithmErrorCode =
  | "INVALID_PARAM"
  | "INVALID_IMAGE"
  | "TOO_LARGE"
  | "UNSUPPORTED";

export class AlgorithmError extends Error {
  readonly code: AlgorithmErrorCode;

  constructor(code: AlgorithmErrorCode, message: string) {
    super(message);
    this.name = "AlgorithmError";
    this.code = code;
  }
}

export class RasterError extends AlgorithmError {
  constructor(message: string) {
    super("INVALID_IMAGE", message);
    this.name = "RasterError";
  }
}

export function isAlgorithmError(value: unknown): value is AlgorithmError {
  return value instanceof AlgorithmError;
}

export function invalidParam(message: string): AlgorithmError {
  return new AlgorithmError("INVALID_PARAM", message);
}

export function invalidImage(message: string): RasterError {
  return new RasterError(message);
}

export function tooLarge(message: string): AlgorithmError {
  return new AlgorithmError("TOO_LARGE", message);
}

export function unsupported(message: string): AlgorithmError {
  return new AlgorithmError("UNSUPPORTED", message);
}
