// Run the fixture server separately before using this CLI configuration.
import { shopProject } from './project.js'
export default shopProject(process.env.SHOP_URL ?? 'http://127.0.0.1:4317')
