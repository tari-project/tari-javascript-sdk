import { safeDispose, isDisposable, isAsyncDisposable } from '@tari-project/tarijs-core';
import { ResourceScope, withResource, withAsyncResource } from './using-helpers';

/**
 * Advanced resource scope patterns for complex scenarios
 */

/**
 * Hierarchical resource scope with parent-child relationships
 */
export class HierarchicalResourceScope implements AsyncDisposable {
  private readonly children = new Set<HierarchicalResourceScope>();
  private readonly resources = new Map<string, Disposable | AsyncDisposable>();
  private parent?: HierarchicalResourceScope;
  private disposed = false;

  constructor(parent?: HierarchicalResourceScope) {
    this.parent = parent;
    if (parent) {
      parent.children.add(this);
    }
  }

  /**
   * Create a child scope
   */
  createChild(): HierarchicalResourceScope {
    if (this.disposed) {
      throw new Error('Cannot create child of disposed scope');
    }
    return new HierarchicalResourceScope(this);
  }

  /**
   * Add a resource to this scope
   */
  add<T extends Disposable | AsyncDisposable>(id: string, resource: T): T {
    if (this.disposed) {
      throw new Error('Cannot add resource to disposed scope');
    }
    
    // Dispose existing resource with same ID
    const existing = this.resources.get(id);
    if (existing) {
      this.disposeResource(existing).catch(error => {
        console.warn(`Error disposing existing resource ${id}:`, error);
      });
    }
    
    this.resources.set(id, resource);
    return resource;
  }

  /**
   * Remove and dispose a resource
   */
  async remove(id: string): Promise<void> {
    const resource = this.resources.get(id);
    if (resource) {
      this.resources.delete(id);
      await this.disposeResource(resource);
    }
  }

  /**
   * Get a resource by ID
   */
  get<T extends Disposable | AsyncDisposable>(id: string): T | undefined {
    return this.resources.get(id) as T | undefined;
  }

  /**
   * Check if scope has a resource
   */
  has(id: string): boolean {
    return this.resources.has(id);
  }

  /**
   * Find a resource in this scope or parent scopes
   */
  find<T extends Disposable | AsyncDisposable>(id: string): T | undefined {
    const resource = this.get<T>(id);
    if (resource) {
      return resource;
    }
    
    return this.parent?.find<T>(id);
  }

  /**
   * Execute operation in this scope context
   */
  async execute<R>(operation: (scope: HierarchicalResourceScope) => Promise<R>): Promise<R> {
    if (this.disposed) {
      throw new Error('Cannot execute in disposed scope');
    }
    return await operation(this);
  }

  /**
   * Get all resource IDs in this scope
   */
  protected getAllIds(): string[] {
    return Array.from(this.resources.keys());
  }

  /**
   * Dispose this scope and all children
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return;
    
    this.disposed = true;
    const errors: Error[] = [];

    // Dispose all children first
    for (const child of this.children) {
      try {
        await child[Symbol.asyncDispose]();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    this.children.clear();

    // Dispose all resources in reverse order
    const resourceEntries = Array.from(this.resources.entries()).reverse();
    for (const [id, resource] of resourceEntries) {
      try {
        await this.disposeResource(resource);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(`Error disposing ${id}: ${error}`));
      }
    }
    this.resources.clear();

    // Remove from parent
    if (this.parent) {
      this.parent.children.delete(this);
      this.parent = undefined;
    }

    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, 'Multiple disposal errors occurred');
    }
  }

  /**
   * Dispose a single resource
   */
  private async disposeResource(resource: Disposable | AsyncDisposable): Promise<void> {
    if (typeof (resource as any)[Symbol.asyncDispose] === 'function') {
      await (resource as any)[Symbol.asyncDispose]();
    } else if (typeof (resource as any)[Symbol.dispose] === 'function') {
      (resource as any)[Symbol.dispose]();
    }
  }

  /**
   * Get scope statistics
   */
  getStats(): ScopeStats {
    const childStats = Array.from(this.children).map(child => child.getStats());
    const totalChildren = childStats.reduce((sum, stats) => sum + stats.totalChildren + 1, 0);
    const totalResources = childStats.reduce((sum, stats) => sum + stats.totalResources, this.resources.size);

    return {
      resourceCount: this.resources.size,
      childCount: this.children.size,
      totalChildren,
      totalResources,
      isDisposed: this.disposed
    };
  }

  /**
   * Check if scope is disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Statistics about a resource scope
 */
export interface ScopeStats {
  resourceCount: number;
  childCount: number;
  totalChildren: number;
  totalResources: number;
  isDisposed: boolean;
}

/**
 * Resource scope with automatic cleanup policies
 */
export class AutoCleanupResourceScope extends HierarchicalResourceScope {
  private readonly cleanupPolicies = new Map<string, CleanupPolicy>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    parent?: HierarchicalResourceScope,
    private readonly cleanupIntervalMs: number = 60000 // 1 minute
  ) {
    super(parent);
    this.startCleanupTimer();
  }

  /**
   * Add resource with cleanup policy
   */
  addWithPolicy<T extends Disposable | AsyncDisposable>(
    id: string,
    resource: T,
    policy: CleanupPolicy
  ): T {
    const result = this.add(id, resource);
    this.cleanupPolicies.set(id, policy);
    return result;
  }

  /**
   * Add resource with TTL (time to live)
   */
  addWithTTL<T extends Disposable | AsyncDisposable>(
    id: string,
    resource: T,
    ttlMs: number
  ): T {
    return this.addWithPolicy(id, resource, {
      type: 'ttl',
      value: ttlMs,
      createdAt: Date.now()
    });
  }

  /**
   * Add resource with idle timeout
   */
  addWithIdleTimeout<T extends Disposable | AsyncDisposable>(
    id: string,
    resource: T,
    idleTimeoutMs: number
  ): T {
    return this.addWithPolicy(id, resource, {
      type: 'idle',
      value: idleTimeoutMs,
      lastAccessedAt: Date.now()
    });
  }

  /**
   * Access a resource (updates last accessed time for idle policy)
   */
  access<T extends Disposable | AsyncDisposable>(id: string): T | undefined {
    const resource = this.get<T>(id);
    if (resource) {
      const policy = this.cleanupPolicies.get(id);
      if (policy && policy.type === 'idle') {
        policy.lastAccessedAt = Date.now();
      }
    }
    return resource;
  }

  /**
   * Remove resource and its policy
   */
  async remove(id: string): Promise<void> {
    await super.remove(id);
    this.cleanupPolicies.delete(id);
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup().catch(error => {
        console.warn('Error during automatic cleanup:', error);
      });
    }, this.cleanupIntervalMs);
  }

  /**
   * Perform cleanup based on policies
   */
  private async performCleanup(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, policy] of this.cleanupPolicies) {
      let shouldCleanup = false;

      switch (policy.type) {
        case 'ttl':
          shouldCleanup = (now - policy.createdAt!) > policy.value;
          break;
        case 'idle':
          shouldCleanup = (now - policy.lastAccessedAt!) > policy.value;
          break;
      }

      if (shouldCleanup) {
        toRemove.push(id);
      }
    }

    // Remove expired resources
    for (const id of toRemove) {
      try {
        await this.remove(id);
      } catch (error) {
        console.warn(`Error removing expired resource ${id}:`, error);
      }
    }
  }

  /**
   * Dispose and stop cleanup timer
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cleanupPolicies.clear();
    await super[Symbol.asyncDispose]();
  }
}

/**
 * Cleanup policy for automatic resource management
 */
export interface CleanupPolicy {
  type: 'ttl' | 'idle';
  value: number; // Timeout in milliseconds
  createdAt?: number;
  lastAccessedAt?: number;
}

/**
 * Transaction-like resource scope with rollback capability
 */
export class TransactionalResourceScope extends HierarchicalResourceScope {
  private readonly committed = new Set<string>();
  private readonly rollbackActions = new Map<string, () => Promise<void>>();

  /**
   * Add resource to transaction
   */
  addTransactional<T extends Disposable | AsyncDisposable>(
    id: string,
    resource: T,
    rollbackAction?: () => Promise<void>
  ): T {
    const result = this.add(id, resource);
    
    if (rollbackAction) {
      this.rollbackActions.set(id, rollbackAction);
    }
    
    return result;
  }

  /**
   * Commit a resource (won't be rolled back)
   */
  commit(id: string): void {
    if (this.has(id)) {
      this.committed.add(id);
      this.rollbackActions.delete(id);
    }
  }

  /**
   * Commit all resources
   */
  commitAll(): void {
    for (const id of this.getAllIds()) {
      this.commit(id);
    }
  }

  /**
   * Rollback uncommitted resources
   */
  async rollback(): Promise<void> {
    const errors: Error[] = [];

    // Execute rollback actions for uncommitted resources
    for (const [id, rollbackAction] of this.rollbackActions) {
      if (!this.committed.has(id)) {
        try {
          await rollbackAction();
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(`Rollback failed for ${id}: ${error}`));
        }
      }
    }

    // Remove uncommitted resources
    const uncommitted = this.getAllIds().filter(id => !this.committed.has(id));
    for (const id of uncommitted) {
      try {
        await this.remove(id);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(`Error removing ${id}: ${error}`));
      }
    }

    this.rollbackActions.clear();

    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, 'Multiple rollback errors occurred');
    }
  }

  /**
   * Dispose with option to rollback first
   */
  async dispose(rollbackFirst: boolean = false): Promise<void> {
    if (rollbackFirst && !this.isDisposed) {
      await this.rollback();
    }
    await this[Symbol.asyncDispose]();
  }
}

/**
 * Factory for creating different types of resource scopes
 */
export class ResourceScopeFactory {
  /**
   * Create a basic resource scope
   */
  static createBasic(): ResourceScope {
    return new ResourceScope();
  }

  /**
   * Create a hierarchical resource scope
   */
  static createHierarchical(parent?: HierarchicalResourceScope): HierarchicalResourceScope {
    return new HierarchicalResourceScope(parent);
  }

  /**
   * Create an auto-cleanup resource scope
   */
  static createAutoCleanup(
    parent?: HierarchicalResourceScope,
    cleanupIntervalMs?: number
  ): AutoCleanupResourceScope {
    return new AutoCleanupResourceScope(parent, cleanupIntervalMs);
  }

  /**
   * Create a transactional resource scope
   */
  static createTransactional(parent?: HierarchicalResourceScope): TransactionalResourceScope {
    return new TransactionalResourceScope(parent);
  }

  /**
   * Create a scope with specific configuration
   */
  static create(config: ScopeConfig): HierarchicalResourceScope {
    let scope: HierarchicalResourceScope;

    switch (config.type) {
      case 'basic':
        scope = new ResourceScope() as any;
        break;
      case 'hierarchical':
        scope = new HierarchicalResourceScope(config.parent);
        break;
      case 'auto-cleanup':
        scope = new AutoCleanupResourceScope(config.parent, config.cleanupIntervalMs);
        break;
      case 'transactional':
        scope = new TransactionalResourceScope(config.parent);
        break;
      default:
        throw new Error(`Unknown scope type: ${(config as any).type}`);
    }

    return scope;
  }
}

/**
 * Configuration for resource scope creation
 */
export type ScopeConfig = 
  | { type: 'basic' }
  | { type: 'hierarchical'; parent?: HierarchicalResourceScope }
  | { type: 'auto-cleanup'; parent?: HierarchicalResourceScope; cleanupIntervalMs?: number }
  | { type: 'transactional'; parent?: HierarchicalResourceScope };
