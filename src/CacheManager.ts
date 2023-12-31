/**
 * Cache Manager
 *
 * {
 * 	 src/styles/variables.css: {
 * 	 },
 *   all: {
 * 			--red: #355324,
 *      --green: #664435
 * 	 }
 * }
 */

export default class CacheManager<T> {
  private cachedVariables: Map<string, Map<string, Map<string, T>>> = new Map();
  private allVariables: Map<string, T> = new Map();

  public get(key: string, filePath?: string) {
    if (filePath) {
      return this.cachedVariables[filePath]?.get(key);
    }

    return this.allVariables?.get(key);
  }

  public getAll() {
    return this.allVariables;
  }

  public getCachedVars() {
    return this.cachedVariables;
  }

  public getAllForWorkspace(currentWorkspace: string) {
    const workspace = this.cachedVariables.get(currentWorkspace);
    if (!workspace) return new Map();
    const variables = new Map();
    workspace.forEach((file) =>
      file.forEach((value, key) => {
        variables.set(key, value);
      })
    );
    return variables;
  }

  public set(filePath: string, key: string, value: T, workspace: string) {
    if (!this.cachedVariables.get(workspace)) {
      this.cachedVariables.set(workspace, new Map());
    }
    if (!this.cachedVariables.get(workspace).get(filePath)) {
      this.cachedVariables.get(workspace).set(filePath, new Map());
    }

    this.allVariables?.set(key, value);
    this.cachedVariables.get(workspace).get(filePath).set(key, value);
  }

  public clearFileCache(filePath: string, workspace: string) {
    this.cachedVariables?.[workspace]?.[filePath]?.forEach((_, key) => {
      this.allVariables?.delete(key);
    });
    this.cachedVariables?.[filePath]?.clear();
  }
  public clearWorkspaceCache(workspace: string) {
    this.cachedVariables.get(workspace).forEach((file) =>
      file.forEach((_, key) => {
        this.allVariables?.delete(key);
      })
    );
    this.cachedVariables.get(workspace).clear();
  }

  public clearAllCache() {
    this.allVariables?.clear();
    this.cachedVariables.clear();
  }
}
