/**
 * Transferable type definitions for non-browser environments
 * In browsers, Transferable is globally available, but in Node.js environments we need to provide it
 */

// Global Transferable interface for environments that don't have it
declare global {
  /**
   * Interface for objects that can be transferred between contexts (Web Workers, etc.)
   * In browser environments, this includes ArrayBuffer, MessagePort, ImageBitmap, etc.
   * For our use case, we primarily need ArrayBuffer support
   */
  interface Transferable {
    readonly [Symbol.toStringTag]: string;
  }

  /**
   * ArrayBuffer is the most common Transferable object we use
   */
  interface ArrayBuffer extends Transferable {}
}

export {};
