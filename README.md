# CSS Variable Langauage Server

I did no actual work on this language server. I just extracted the language server Vu Nguyen created for CSS Variables Autocomplete and adapted it for my use case. All credit goes to Vu Nguyen.

## Installation

```bash
npm i -g css-variable-ls
```

## Setup

```lua
    if not configs.cssvar then
        configs.cssvar = {
            default_config = {
                cmd = { "cssvar", "--stdio" },
                filetypes = { "css", "scss", "less" },
                root_dir = lsp.util.root_pattern("package.json", ".git"),
                single_file_support = true,
                settings = {
                    cssVariables = {
                        lookupFiles = {
                            "**/*.css",
                            "**/*.scss",
                            "**/*.sass",
                            "**/*.less",
                        },
                    },
                },
            },
            docs = {
                default_config = {
                    root_dir = [[root_pattern("", ".git") or bufdir]],
                },
            },
        }
    end
    lsp.cssvar.setup({
    ...
        on_new_config = function(_, root_dir)
            local client = vim.lsp.get_active_clients({ name = "cssvar" })[1]
            local path = util.path.join(root_dir, ".luarc.json")
            if util.path.exists(path) == false then
                return
            end
            local f = assert(io.open(path, "r")) -- assuming path is in the scope
            local content = f:read("*a")
            f:close()
            local config = vim.json.decode(content)
            if config == nil or config["cssVariables"] == nil then
                return
            end
            if client == nil then
                return
            end
            client.notify(
                "workspace/didChangeConfiguration",
                { settings = {
                    cssVariables = config["cssVariables"],
                } }
            )
        end,
        ...
    })

```
