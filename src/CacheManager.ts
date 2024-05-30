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
  private cachedVariablesByWorkspace: Map<string, Map<string, Map<string, T>>> =
    new Map();
  private allVariables: Map<string, T> = new Map();

  public get(key: string, filePath?: string) {
    if (filePath) {
      return this.cachedVariablesByWorkspace[filePath]?.get(key);
    }

    return this.allVariables?.get(key);
  }

  public getAll() {
    return this.allVariables;
  }

  public getCachedVars() {
    return this.cachedVariablesByWorkspace;
  }

  public getAllForWorkspace(currentWorkspace: string) {
    const workspace = this.cachedVariablesByWorkspace.get(currentWorkspace);
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
    if (!this.cachedVariablesByWorkspace.get(workspace)) {
      this.cachedVariablesByWorkspace.set(workspace, new Map());
    }
    if (!this.cachedVariablesByWorkspace.get(workspace).get(filePath)) {
      this.cachedVariablesByWorkspace.get(workspace).set(filePath, new Map());
    }

    this.allVariables?.set(key, value);
    this.cachedVariablesByWorkspace
      .get(workspace)
      .get(filePath)
      .set(key, value);
  }

  public clearFileCache(filePath: string, workspace: string) {
    this.cachedVariablesByWorkspace?.[workspace]?.[filePath]?.forEach(
      (_, key) => {
        this.allVariables?.delete(key);
      }
    );
    this.cachedVariablesByWorkspace?.[filePath]?.clear();
  }
  public clearWorkspaceCache(workspace: string) {
    this.cachedVariablesByWorkspace.get(workspace).forEach((file) =>
      file.forEach((_, key) => {
        this.allVariables?.delete(key);
      })
    );
    this.cachedVariablesByWorkspace.get(workspace).clear();
  }

  public clearAllCache() {
    this.allVariables?.clear();
    this.cachedVariablesByWorkspace.clear();
  }
}
