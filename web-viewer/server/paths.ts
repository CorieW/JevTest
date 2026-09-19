// Keep report and evidence paths within the selected report directory.
import { relative, sep, isAbsolute } from 'node:path'
export const inside = (root: string, file: string) => {
  const path = relative(root, file)
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}
