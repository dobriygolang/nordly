interface RunFinalizePlanOptions {
  finalize: () => Promise<void>;
  onSuccess: () => void;
  onError: (error: unknown) => void;
}

/** Finalize without leaking a rejected promise from a fire-and-forget UI handler. */
export async function runFinalizePlan({
  finalize,
  onSuccess,
  onError,
}: RunFinalizePlanOptions): Promise<boolean> {
  try {
    await finalize();
    onSuccess();
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}
