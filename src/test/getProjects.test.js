require('dotenv').config();

const {
  getOtherProjects,
  getCpaasProjects,
  getFlipkartProjects
} = require('../services/getProjects'); // adjust path if needed

async function test() {
  try {
    console.log("🧪 TEST STARTED");

    // =========================
    // 🔵 TEST OTHERS
    // =========================
    const others = await getOtherProjects();
    console.log("🔵 OTHERS SAMPLE:", others.slice(0, 3));

    // =========================
    // 🟡 TEST CPAAS
    // =========================
    const cpaas = await getCpaasProjects();
    console.log("🟡 CPAAS SAMPLE:", cpaas.slice(0, 3));

    // =========================
    // 🟣 TEST FLIPKART
    // =========================
    const flipkart = await getFlipkartProjects();
    console.log("🟣 FLIPKART SAMPLE:", flipkart.slice(0, 3));

    console.log("✅ TEST COMPLETED");

  } catch (err) {
    console.error("💥 TEST FAILED:", err.message);
  } finally {
    process.exit(0);
  }
}

test();