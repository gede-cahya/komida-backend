import { adminService } from "./src/service/adminService.ts"; async function run() { await adminService.fixCorruptedImages(); console.log("FINISHED"); process.exit(0); } run();
