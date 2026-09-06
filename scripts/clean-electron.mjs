import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Electron 编译目录必须在生产构建前清空，避免已经删除或移动的源码继续残留在 dist-electron 中。
 * 该脚本只操作生成目录，不会触碰源码、用户数据或服务端项目。
 */
await rm(path.join(projectDirectory, 'dist-electron'), { recursive: true, force: true })
