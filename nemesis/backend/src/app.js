const express = require("express");
const cors = require("cors");
const { CORS_ORIGIN } = require("./config");
const { getBootstrapPayload, getOwnerPackages, getRegionPackages, getProvincePackages, getRegionDashboard, getRegionGeoJsonWithStats, getRegionByName } = require("./dashboard-repository");

function resolveCorsOrigin() {
  if (CORS_ORIGIN === "*") {
    return "*";
  }

  return CORS_ORIGIN.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createApp(db) {
  const app = express();

  app.use(
    cors({
      origin: resolveCorsOrigin(),
    })
  );
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/bootstrap", (_req, res) => {
    res.json(getBootstrapPayload(db));
  });

  app.get("/api/regions/:regionKey/packages", (req, res) => {
    const payload = getRegionPackages(db, req.params.regionKey, req.query);

    if (!payload) {
      res.status(404).json({ error: "Region not found" });
      return;
    }

    res.json(payload);
  });

  app.get("/api/regions/:regionKey/dashboard", (req, res) => {
    const payload = getRegionDashboard(db, req.params.regionKey);

    if (!payload) {
      res.status(404).json({ error: "Region not found" });
      return;
    }

    res.json(payload);
  });

  app.get("/api/provinces/:provinceKey/packages", (req, res) => {
    const payload = getProvincePackages(db, req.params.provinceKey, req.query);

    if (!payload) {
      res.status(404).json({ error: "Province not found" });
      return;
    }

    res.json(payload);
  });

  app.get("/api/owners/packages", (req, res) => {
    const ownerType = (req.query.ownerType || "").trim();
    const ownerName = (req.query.ownerName || "").trim();

    if (!ownerType || !ownerName) {
      res.status(400).json({ error: "ownerType and ownerName are required" });
      return;
    }

    const payload = getOwnerPackages(db, req.query);

    if (!payload) {
      res.status(404).json({ error: "Owner not found" });
      return;
    }

    res.json(payload);
  });

  // More specific routes must come BEFORE the catch-all route with :districtName
  app.get("/api/geo/:districtName/anomalies", (req, res) => {
    try {
      const regionName = decodeURIComponent(req.params.districtName);
      const region = getRegionByName(db, regionName);
      
      if (!region) {
        return res.status(404).json({ 
          error: "Region not found",
          message: `Wilayah '${regionName}' tidak ditemukan dalam database`
        });
      }

      const payload = getRegionDashboard(db, region.region_key);

      if (!payload) {
        return res.status(404).json({ 
          error: "Region data not found",
          message: `Data untuk wilayah '${regionName}' tidak tersedia`
        });
      }

      res.json({
        region: payload.region,
        anomalies: payload.anomalies,
        severityBreakdown: payload.severityBreakdown,
      });
    } catch (error) {
      console.error(`Error in /api/geo/:districtName/anomalies:`, error);
      res.status(500).json({ 
        error: "Internal server error",
        message: error.message
      });
    }
  });

  app.get("/api/geo/:districtName/umkm", (req, res) => {
    try {
      const regionName = decodeURIComponent(req.params.districtName);
      const region = getRegionByName(db, regionName);
      
      if (!region) {
        return res.status(404).json({ 
          error: "Region not found",
          message: `Wilayah '${regionName}' tidak ditemukan dalam database`
        });
      }

      const payload = getRegionDashboard(db, region.region_key);

      if (!payload) {
        return res.status(404).json({ 
          error: "Region data not found",
          message: `Data untuk wilayah '${regionName}' tidak tersedia`
        });
      }

      res.json({
        region: payload.region,
        umkmPotentials: payload.umkmPotentials,
        topPackages: payload.topPackages.slice(0, 5),
      });
    } catch (error) {
      console.error(`Error in /api/geo/:districtName/umkm:`, error);
      res.status(500).json({ 
        error: "Internal server error",
        message: error.message
      });
    }
  });

  // Catch-all route for main geo endpoint
  app.get("/api/geo/:districtName", (req, res) => {
    try {
      const regionName = decodeURIComponent(req.params.districtName);
      const payload = getRegionGeoJsonWithStats(db, regionName);

      if (!payload) {
        return res.status(404).json({ 
          error: "Region not found",
          message: `Wilayah '${regionName}' tidak ditemukan dalam database`
        });
      }

      res.json(payload);
    } catch (error) {
      console.error(`Error in /api/geo/:districtName:`, error);
      res.status(500).json({ 
        error: "Internal server error",
        message: error.message
      });
    }
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

module.exports = {
  createApp,
};
