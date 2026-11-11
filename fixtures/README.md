# Fixtures

Hand-written for this project. No Minecraft assets, no upstream sample content — anything shipped
by Mojang under `res/latest/van` is covered by the Minecraft EULA and is deliberately absent.

| Directory         | What it exercises                                           |
| ----------------- | ----------------------------------------------------------- |
| `sample/`         | A clean behavior pack + resource pack pair.                 |
| `jsonc/`          | Comments and trailing commas, which real manifests contain. |
| `broken/`         | A syntax error with a known line and column.                |
| `duplicate-uuid/` | Two packs sharing a header UUID.                            |
| `bad-icon/`       | A `pack_icon.png` that is not a PNG.                        |

Tests build their own fixtures in memory; these exist for the CLI, the TUI and for a human to poke.
