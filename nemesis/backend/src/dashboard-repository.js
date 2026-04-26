const { DEFAULT_REGION_PAGE_SIZE, MAX_REGION_PAGE_SIZE } = require("./config");

const LEGEND_COLORS = ["#7b86a3", "#b5a882", "#d4a999", "#8b7332", "#a83c2e"];
const VALID_OWNER_TYPES = ["kabkota", "provinsi", "central", "other"];
const VALID_SEVERITIES = ["low", "med", "high", "absurd"];
const OWNER_METRIC_DEFINITIONS = [
  {
    key: "central",
    countField: "central_packages",
    priorityField: "central_priority_packages",
    wasteField: "central_potential_waste",
    budgetField: "central_budget",
  },
  {
    key: "provinsi",
    countField: "provincial_packages",
    priorityField: "provincial_priority_packages",
    wasteField: "provincial_potential_waste",
    budgetField: "provincial_budget",
  },
  {
    key: "kabkota",
    countField: "local_packages",
    priorityField: "local_priority_packages",
    wasteField: "local_potential_waste",
    budgetField: "local_budget",
  },
  {
    key: "other",
    countField: "other_packages",
    priorityField: "other_priority_packages",
    wasteField: "other_potential_waste",
    budgetField: "other_budget",
  },
];

function getJsonAsset(db, key, fallback) {
  const row = db.prepare("SELECT json FROM assets WHERE key = ?").get(key);
  return row ? JSON.parse(row.json) : fallback;
}

function clampInteger(value, defaultValue, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

function parseBooleanQuery(value) {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "ya"].includes(normalized);
}

function escapeLikePattern(value) {
  return String(value).replace(/[\\%_]/g, (match) => `\\${match}`);
}

function dominantOwnerType(row) {
  const counts = [
    { key: "central", value: row.central_packages || 0 },
    { key: "provinsi", value: row.provincial_packages || 0 },
    { key: "kabkota", value: row.local_packages || 0 },
    { key: "other", value: row.other_packages || 0 },
  ].sort((left, right) => right.value - left.value);

  return counts[0].value > 0 ? counts[0].key : null;
}

function buildOwnerMetrics(row) {
  return OWNER_METRIC_DEFINITIONS.reduce((metrics, definition) => {
    metrics[definition.key] = {
      totalPackages: row[definition.countField] || 0,
      totalPriorityPackages: row[definition.priorityField] || 0,
      totalPotentialWaste: row[definition.wasteField] || 0,
      totalBudget: row[definition.budgetField] || 0,
    };

    return metrics;
  }, {});
}

function buildProvinceOwnerMetrics(row) {
  return {
    central: {
      totalPackages: 0,
      totalPriorityPackages: 0,
      totalPotentialWaste: 0,
      totalBudget: 0,
    },
    provinsi: {
      totalPackages: row.total_packages || 0,
      totalPriorityPackages: row.total_priority_packages || 0,
      totalPotentialWaste: row.total_potential_waste || 0,
      totalBudget: row.total_budget || 0,
    },
    kabkota: {
      totalPackages: 0,
      totalPriorityPackages: 0,
      totalPotentialWaste: 0,
      totalBudget: 0,
    },
    other: {
      totalPackages: 0,
      totalPriorityPackages: 0,
      totalPotentialWaste: 0,
      totalBudget: 0,
    },
  };
}

function mapOwnerRow(row) {
  return {
    ownerType: row.owner_type,
    ownerName: row.owner_name,
    totalPackages: row.total_packages,
    totalPriorityPackages: row.total_priority_packages,
    totalFlaggedPackages: row.total_flagged_packages,
    totalPotentialWaste: row.total_potential_waste,
    totalBudget: row.total_budget,
    severityCounts: {
      med: row.med_severity_packages,
      high: row.high_severity_packages,
      absurd: row.absurd_severity_packages,
    },
  };
}

function mapRegionRow(row) {
  return {
    regionKey: row.region_key,
    code: row.code,
    provinceName: row.province_name,
    regionName: row.region_name,
    regionType: row.region_type,
    displayName: row.display_name,
    totalPackages: row.total_packages,
    totalPriorityPackages: row.total_priority_packages,
    totalFlaggedPackages: row.total_flagged_packages,
    totalPotentialWaste: row.total_potential_waste,
    totalBudget: row.total_budget,
    avgRiskScore: Number((row.avg_risk_score || 0).toFixed(2)),
    maxRiskScore: row.max_risk_score,
    ownerMix: {
      central: row.central_packages,
      provinsi: row.provincial_packages,
      kabkota: row.local_packages,
      other: row.other_packages,
    },
    ownerMetrics: buildOwnerMetrics(row),
    severityCounts: {
      med: row.med_severity_packages,
      high: row.high_severity_packages,
      absurd: row.absurd_severity_packages,
    },
    dominantOwnerType: dominantOwnerType(row),
  };
}

function mapProvinceRow(row) {
  return {
    provinceKey: row.province_key,
    code: row.code,
    provinceName: row.province_name,
    regionName: row.province_name,
    regionType: "Provinsi",
    displayName: row.display_name,
    totalPackages: row.total_packages,
    totalPriorityPackages: row.total_priority_packages,
    totalFlaggedPackages: row.total_flagged_packages,
    totalPotentialWaste: row.total_potential_waste,
    totalBudget: row.total_budget,
    avgRiskScore: Number((row.avg_risk_score || 0).toFixed(2)),
    maxRiskScore: row.max_risk_score,
    ownerMix: {
      central: 0,
      provinsi: row.total_packages,
      kabkota: 0,
      other: 0,
    },
    ownerMetrics: buildProvinceOwnerMetrics(row),
    severityCounts: {
      med: row.med_severity_packages,
      high: row.high_severity_packages,
      absurd: row.absurd_severity_packages,
    },
    dominantOwnerType: row.total_packages > 0 ? "provinsi" : null,
  };
}

function buildLegend(values) {
  const positiveValues = values.filter((value) => value > 0).sort((left, right) => left - right);
  const ranges = [];

  if (!positiveValues.length) {
    return {
      zeroColor: "#243155",
      ranges,
    };
  }

  const quantiles = [0.2, 0.4, 0.6, 0.8, 1].map((ratio) => {
    const index = Math.min(positiveValues.length - 1, Math.floor((positiveValues.length - 1) * ratio));
    return positiveValues[index];
  });

  let minimum = positiveValues[0];

  for (let index = 0; index < quantiles.length; index += 1) {
    const maximum = quantiles[index];

    if (maximum < minimum) {
      continue;
    }

    if (ranges.length && maximum === ranges[ranges.length - 1].max) {
      continue;
    }

    ranges.push({
      key: `band-${index + 1}`,
      color: LEGEND_COLORS[Math.min(index, LEGEND_COLORS.length - 1)],
      min: minimum,
      max: maximum,
    });

    minimum = maximum + 0.01;
  }

  return {
    zeroColor: "#243155",
    ranges,
  };
}

function getNationalSummary(db) {
  return db
    .prepare(`
      SELECT
        COUNT(*) AS total_packages,
        COALESCE(SUM(is_priority), 0) AS total_priority_packages,
        COALESCE(ROUND(SUM(potential_waste), 2), 0) AS total_potential_waste,
        COALESCE(SUM(COALESCE(budget, 0)), 0) AS total_budget,
        COALESCE(SUM(CASE WHEN mapped_region_count = 0 THEN 1 ELSE 0 END), 0) AS unmapped_packages,
        COALESCE(SUM(CASE WHEN mapped_region_count > 1 THEN 1 ELSE 0 END), 0) AS multi_location_packages
      FROM packages
    `)
    .get();
}

function getRegionRows(db) {
  return db
    .prepare(`
      SELECT
        regions.region_key,
        regions.code,
        regions.province_name,
        regions.region_name,
        regions.region_type,
        regions.display_name,
        region_metrics.total_packages,
        region_metrics.total_priority_packages,
        region_metrics.total_flagged_packages,
        region_metrics.total_potential_waste,
        region_metrics.total_budget,
        region_metrics.avg_risk_score,
        region_metrics.max_risk_score,
        region_metrics.central_packages,
        region_metrics.provincial_packages,
        region_metrics.local_packages,
        region_metrics.other_packages,
        region_metrics.central_priority_packages,
        region_metrics.provincial_priority_packages,
        region_metrics.local_priority_packages,
        region_metrics.other_priority_packages,
        region_metrics.central_potential_waste,
        region_metrics.provincial_potential_waste,
        region_metrics.local_potential_waste,
        region_metrics.other_potential_waste,
        region_metrics.central_budget,
        region_metrics.provincial_budget,
        region_metrics.local_budget,
        region_metrics.other_budget,
        region_metrics.med_severity_packages,
        region_metrics.high_severity_packages,
        region_metrics.absurd_severity_packages
      FROM regions
      INNER JOIN region_metrics ON region_metrics.region_key = regions.region_key
      ORDER BY
        region_metrics.total_potential_waste DESC,
        region_metrics.total_priority_packages DESC,
        region_metrics.total_packages DESC,
        regions.display_name ASC
    `)
    .all();
}

function getProvinceRows(db) {
  return db
    .prepare(`
      SELECT
        provinces.province_key,
        provinces.code,
        provinces.province_name,
        provinces.display_name,
        province_metrics.total_packages,
        province_metrics.total_priority_packages,
        province_metrics.total_flagged_packages,
        province_metrics.total_potential_waste,
        province_metrics.total_budget,
        province_metrics.avg_risk_score,
        province_metrics.max_risk_score,
        province_metrics.med_severity_packages,
        province_metrics.high_severity_packages,
        province_metrics.absurd_severity_packages
      FROM provinces
      INNER JOIN province_metrics ON province_metrics.province_key = provinces.province_key
      ORDER BY
        province_metrics.total_potential_waste DESC,
        province_metrics.total_priority_packages DESC,
        province_metrics.total_packages DESC,
        provinces.display_name ASC
    `)
    .all();
}

function getOwnerRows(db, ownerType) {
  return db
    .prepare(`
      SELECT
        owner_metrics.owner_type,
        owner_metrics.owner_name,
        owner_metrics.total_packages,
        owner_metrics.total_priority_packages,
        owner_metrics.total_flagged_packages,
        owner_metrics.total_potential_waste,
        owner_metrics.total_budget,
        owner_metrics.med_severity_packages,
        owner_metrics.high_severity_packages,
        owner_metrics.absurd_severity_packages
      FROM owner_metrics
      WHERE owner_metrics.owner_type = ?
      ORDER BY
        owner_metrics.total_potential_waste DESC,
        owner_metrics.total_priority_packages DESC,
        owner_metrics.total_packages DESC,
        owner_metrics.owner_name ASC
    `)
    .all(ownerType);
}

function normalizeScopedPackageQuery(requestQuery, options = {}) {
  return {
    page: clampInteger(requestQuery.page, 1, 1, Number.MAX_SAFE_INTEGER),
    pageSize: clampInteger(requestQuery.pageSize, DEFAULT_REGION_PAGE_SIZE, 1, MAX_REGION_PAGE_SIZE),
    search: (requestQuery.search || "").trim(),
    ownerType: options.allowOwnerType === false ? "" : (requestQuery.ownerType || "").trim(),
    severity: options.allowSeverity === false ? "" : (requestQuery.severity || "").trim(),
    priorityOnly: parseBooleanQuery(requestQuery.priorityOnly),
  };
}

function buildPackagesWhereClause(scopeColumn, scopeKey, query, options = {}) {
  const clauses = [`${scopeColumn} = ?`];
  const params = [scopeKey];

  if (query.search) {
    const searchValue = `%${escapeLikePattern(query.search)}%`;
    clauses.push(
      "(packages.package_name LIKE ? ESCAPE '\\' OR packages.owner_name LIKE ? ESCAPE '\\' OR COALESCE(packages.satker, '') LIKE ? ESCAPE '\\')"
    );
    params.push(searchValue, searchValue, searchValue);
  }

  if (options.forcedOwnerType) {
    clauses.push("packages.owner_type = ?");
    params.push(options.forcedOwnerType);
  } else if (VALID_OWNER_TYPES.includes(query.ownerType)) {
    clauses.push("packages.owner_type = ?");
    params.push(query.ownerType);
  }

  if (options.allowSeverity !== false && VALID_SEVERITIES.includes(query.severity)) {
    clauses.push("packages.severity = ?");
    params.push(query.severity);
  }

  if (query.priorityOnly) {
    clauses.push("packages.is_priority = 1");
  }

  return {
    sql: clauses.join(" AND "),
    params,
  };
}

function buildOwnerPackagesWhereClause(ownerType, ownerName, query) {
  const clauses = ["packages.owner_type = ?", "packages.owner_name = ?"];
  const params = [ownerType, ownerName];

  if (query.search) {
    const searchValue = `%${escapeLikePattern(query.search)}%`;
    clauses.push(
      "(packages.package_name LIKE ? ESCAPE '\\' OR packages.owner_name LIKE ? ESCAPE '\\' OR COALESCE(packages.satker, '') LIKE ? ESCAPE '\\')"
    );
    params.push(searchValue, searchValue, searchValue);
  }

  if (VALID_SEVERITIES.includes(query.severity)) {
    clauses.push("packages.severity = ?");
    params.push(query.severity);
  }

  if (query.priorityOnly) {
    clauses.push("packages.is_priority = 1");
  }

  return {
    sql: clauses.join(" AND "),
    params,
  };
}

function mapPackageRow(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    packageName: row.package_name,
    ownerName: row.owner_name,
    ownerType: row.owner_type,
    satker: row.satker,
    locationRaw: row.location_raw,
    budget: row.budget,
    fundingSource: row.funding_source,
    procurementType: row.procurement_type,
    procurementMethod: row.procurement_method,
    selectionDate: row.selection_date,
    audit: {
      schemaVersion: row.schema_version,
      severity: row.severity,
      potensiPemborosan: row.potential_waste,
      reason: row.reason,
      flags: {
        isMencurigakan: row.is_mencurigakan === null ? null : Boolean(row.is_mencurigakan),
        isPemborosan: row.is_pemborosan === null ? null : Boolean(row.is_pemborosan),
      },
    },
    meta: {
      isPriority: Boolean(row.is_priority),
      isFlagged: Boolean(row.is_flagged),
      riskScore: row.risk_score,
      activeTagCount: row.active_tag_count,
      mappedRegionCount: row.mapped_region_count,
    },
  };
}

function queryPackagesPage(db, scopeTable, scopeColumn, scopeKey, normalizedQuery, options = {}) {
  const whereClause = buildPackagesWhereClause(scopeColumn, scopeKey, normalizedQuery, options);
  const countRow = db
    .prepare(`
      SELECT COUNT(*) AS total
      FROM ${scopeTable}
      INNER JOIN packages ON packages.id = ${scopeTable}.package_id
      WHERE ${whereClause.sql}
    `)
    .get(...whereClause.params);
  const totalItems = countRow.total || 0;
  const totalPages = totalItems ? Math.ceil(totalItems / normalizedQuery.pageSize) : 1;
  const page = Math.min(normalizedQuery.page, totalPages);
  const offset = (page - 1) * normalizedQuery.pageSize;
  const rows = db
    .prepare(`
      SELECT
        packages.id,
        packages.source_id,
        packages.schema_version,
        packages.owner_name,
        packages.owner_type,
        packages.satker,
        packages.package_name,
        packages.location_raw,
        packages.budget,
        packages.funding_source,
        packages.procurement_type,
        packages.procurement_method,
        packages.selection_date,
        packages.potential_waste,
        packages.severity,
        packages.reason,
        packages.is_mencurigakan,
        packages.is_pemborosan,
        packages.risk_score,
        packages.active_tag_count,
        packages.is_priority,
        packages.is_flagged,
        packages.mapped_region_count
      FROM ${scopeTable}
      INNER JOIN packages ON packages.id = ${scopeTable}.package_id
      WHERE ${whereClause.sql}
      ORDER BY
        packages.is_priority DESC,
        packages.potential_waste DESC,
        packages.risk_score DESC,
        COALESCE(packages.budget, 0) DESC,
        packages.inserted_order ASC
      LIMIT ? OFFSET ?
    `)
    .all(...whereClause.params, normalizedQuery.pageSize, offset)
    .map(mapPackageRow);

  return {
    totalItems,
    page,
    pageSize: normalizedQuery.pageSize,
    totalPages,
    rows,
  };
}

function queryOwnerPackagesPage(db, ownerType, ownerName, normalizedQuery) {
  const whereClause = buildOwnerPackagesWhereClause(ownerType, ownerName, normalizedQuery);
  const countRow = db
    .prepare(`
      SELECT COUNT(*) AS total
      FROM packages
      WHERE ${whereClause.sql}
    `)
    .get(...whereClause.params);
  const totalItems = countRow.total || 0;
  const totalPages = totalItems ? Math.ceil(totalItems / normalizedQuery.pageSize) : 1;
  const page = Math.min(normalizedQuery.page, totalPages);
  const offset = (page - 1) * normalizedQuery.pageSize;
  const rows = db
    .prepare(`
      SELECT
        packages.id,
        packages.source_id,
        packages.schema_version,
        packages.owner_name,
        packages.owner_type,
        packages.satker,
        packages.package_name,
        packages.location_raw,
        packages.budget,
        packages.funding_source,
        packages.procurement_type,
        packages.procurement_method,
        packages.selection_date,
        packages.potential_waste,
        packages.severity,
        packages.reason,
        packages.is_mencurigakan,
        packages.is_pemborosan,
        packages.risk_score,
        packages.active_tag_count,
        packages.is_priority,
        packages.is_flagged,
        packages.mapped_region_count
      FROM packages
      WHERE ${whereClause.sql}
      ORDER BY
        packages.is_priority DESC,
        packages.potential_waste DESC,
        packages.risk_score DESC,
        COALESCE(packages.budget, 0) DESC,
        packages.inserted_order ASC
      LIMIT ? OFFSET ?
    `)
    .all(...whereClause.params, normalizedQuery.pageSize, offset)
    .map(mapPackageRow);

  return {
    totalItems,
    page,
    pageSize: normalizedQuery.pageSize,
    totalPages,
    rows,
  };
}

function getBootstrapPayload(db) {
  const summaryRow = getNationalSummary(db);
  const regions = getRegionRows(db).map(mapRegionRow);
  const provinces = getProvinceRows(db).map(mapProvinceRow);
  const centralOwners = getOwnerRows(db, "central").map(mapOwnerRow);

  return {
    summary: {
      totalPackages: summaryRow.total_packages || 0,
      totalPriorityPackages: summaryRow.total_priority_packages || 0,
      totalPotentialWaste: summaryRow.total_potential_waste || 0,
      totalBudget: summaryRow.total_budget || 0,
      unmappedPackages: summaryRow.unmapped_packages || 0,
      multiLocationPackages: summaryRow.multi_location_packages || 0,
    },
    legend: buildLegend(regions.map((region) => region.totalPotentialWaste)),
    geo: getJsonAsset(db, "audit_geojson", { type: "FeatureCollection", features: [] }),
    regions,
    provinceView: {
      legend: buildLegend(provinces.map((province) => province.totalPotentialWaste)),
      geo: getJsonAsset(db, "audit_province_geojson", { type: "FeatureCollection", features: [] }),
      provinces,
    },
    ownerLists: {
      central: centralOwners,
    },
  };
}

function getRegionPackages(db, regionKey, requestQuery) {
  const regionRow = db
    .prepare(`
      SELECT
        regions.region_key,
        regions.code,
        regions.province_name,
        regions.region_name,
        regions.region_type,
        regions.display_name,
        region_metrics.total_packages,
        region_metrics.total_priority_packages,
        region_metrics.total_flagged_packages,
        region_metrics.total_potential_waste,
        region_metrics.total_budget,
        region_metrics.avg_risk_score,
        region_metrics.max_risk_score,
        region_metrics.central_packages,
        region_metrics.provincial_packages,
        region_metrics.local_packages,
        region_metrics.other_packages,
        region_metrics.central_priority_packages,
        region_metrics.provincial_priority_packages,
        region_metrics.local_priority_packages,
        region_metrics.other_priority_packages,
        region_metrics.central_potential_waste,
        region_metrics.provincial_potential_waste,
        region_metrics.local_potential_waste,
        region_metrics.other_potential_waste,
        region_metrics.central_budget,
        region_metrics.provincial_budget,
        region_metrics.local_budget,
        region_metrics.other_budget,
        region_metrics.med_severity_packages,
        region_metrics.high_severity_packages,
        region_metrics.absurd_severity_packages
      FROM regions
      INNER JOIN region_metrics ON region_metrics.region_key = regions.region_key
      WHERE regions.region_key = ?
    `)
    .get(regionKey);

  if (!regionRow) {
    return null;
  }

  const normalizedQuery = normalizeScopedPackageQuery(requestQuery);
  const pageResult = queryPackagesPage(db, "package_regions", "package_regions.region_key", regionKey, normalizedQuery);

  return {
    region: mapRegionRow(regionRow),
    summary: {
      totalItems: pageResult.totalItems,
      filteredItems: pageResult.totalItems,
    },
    pagination: {
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      totalItems: pageResult.totalItems,
      totalPages: pageResult.totalPages,
    },
    filters: {
      search: normalizedQuery.search,
      ownerType: normalizedQuery.ownerType,
      severity: normalizedQuery.severity,
      priorityOnly: normalizedQuery.priorityOnly,
    },
    items: pageResult.rows,
  };
}

function getProvincePackages(db, provinceKey, requestQuery) {
  const provinceRow = db
    .prepare(`
      SELECT
        provinces.province_key,
        provinces.code,
        provinces.province_name,
        provinces.display_name,
        province_metrics.total_packages,
        province_metrics.total_priority_packages,
        province_metrics.total_flagged_packages,
        province_metrics.total_potential_waste,
        province_metrics.total_budget,
        province_metrics.avg_risk_score,
        province_metrics.max_risk_score,
        province_metrics.med_severity_packages,
        province_metrics.high_severity_packages,
        province_metrics.absurd_severity_packages
      FROM provinces
      INNER JOIN province_metrics ON province_metrics.province_key = provinces.province_key
      WHERE provinces.province_key = ?
    `)
    .get(provinceKey);

  if (!provinceRow) {
    return null;
  }

  const normalizedQuery = normalizeScopedPackageQuery(requestQuery, {
    allowOwnerType: false,
  });
  const pageResult = queryPackagesPage(
    db,
    "package_provinces",
    "package_provinces.province_key",
    provinceKey,
    normalizedQuery,
    {
      forcedOwnerType: "provinsi",
    }
  );

  return {
    province: mapProvinceRow(provinceRow),
    summary: {
      totalItems: pageResult.totalItems,
      filteredItems: pageResult.totalItems,
    },
    pagination: {
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      totalItems: pageResult.totalItems,
      totalPages: pageResult.totalPages,
    },
    filters: {
      search: normalizedQuery.search,
      severity: normalizedQuery.severity,
      priorityOnly: normalizedQuery.priorityOnly,
    },
    items: pageResult.rows,
  };
}

function getOwnerPackages(db, requestQuery) {
  const ownerType = (requestQuery.ownerType || "").trim();
  const ownerName = (requestQuery.ownerName || "").trim();

  if (!VALID_OWNER_TYPES.includes(ownerType) || !ownerName) {
    return null;
  }

  const ownerRow = db
    .prepare(`
      SELECT
        owner_metrics.owner_type,
        owner_metrics.owner_name,
        owner_metrics.total_packages,
        owner_metrics.total_priority_packages,
        owner_metrics.total_flagged_packages,
        owner_metrics.total_potential_waste,
        owner_metrics.total_budget,
        owner_metrics.med_severity_packages,
        owner_metrics.high_severity_packages,
        owner_metrics.absurd_severity_packages
      FROM owner_metrics
      WHERE owner_metrics.owner_type = ?
        AND owner_metrics.owner_name = ?
    `)
    .get(ownerType, ownerName);

  if (!ownerRow) {
    return null;
  }

  const normalizedQuery = normalizeScopedPackageQuery(requestQuery, {
    allowOwnerType: false,
  });
  const pageResult = queryOwnerPackagesPage(db, ownerType, ownerName, normalizedQuery);

  return {
    owner: mapOwnerRow(ownerRow),
    summary: {
      totalItems: pageResult.totalItems,
      filteredItems: pageResult.totalItems,
    },
    pagination: {
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      totalItems: pageResult.totalItems,
      totalPages: pageResult.totalPages,
    },
    filters: {
      search: normalizedQuery.search,
      severity: normalizedQuery.severity,
      priorityOnly: normalizedQuery.priorityOnly,
    },
    items: pageResult.rows,
  };
}

function getRegionDashboard(db, regionKey) {
  const regionRow = db
    .prepare(`
      SELECT r.region_key, r.display_name, r.region_type
      FROM regions r
      WHERE r.region_key = ?
    `)
    .get(regionKey);

  if (!regionRow) {
    return null;
  }

  const ownerBreakdown = db
    .prepare(`
      SELECT
        packages.owner_type,
        COUNT(*) as count,
        COALESCE(SUM(packages.potential_waste), 0) as waste,
        COALESCE(SUM(packages.is_priority), 0) as priority_count
      FROM package_regions
      INNER JOIN packages ON packages.id = package_regions.package_id
      WHERE package_regions.region_key = ?
      GROUP BY packages.owner_type
    `)
    .all(regionKey);

  const severityBreakdown = db
    .prepare(`
      SELECT
        packages.severity,
        COUNT(*) as count,
        COALESCE(SUM(packages.potential_waste), 0) as waste
      FROM package_regions
      INNER JOIN packages ON packages.id = package_regions.package_id
      WHERE package_regions.region_key = ?
      GROUP BY packages.severity
    `)
    .all(regionKey);

  const topPackages = db
    .prepare(`
      SELECT
        packages.id,
        packages.source_id,
        packages.package_name,
        packages.owner_name,
        packages.owner_type,
        packages.budget,
        packages.potential_waste,
        packages.severity,
        packages.is_priority
      FROM package_regions
      INNER JOIN packages ON packages.id = package_regions.package_id
      WHERE package_regions.region_key = ?
      ORDER BY packages.potential_waste DESC
      LIMIT 10
    `)
    .all(regionKey);

  const anomalies = db
    .prepare(`
      SELECT
        packages.id,
        packages.source_id,
        packages.package_name,
        packages.owner_name,
        packages.owner_type,
        packages.budget,
        packages.potential_waste,
        packages.severity,
        packages.is_priority,
        CASE 
          WHEN packages.severity IN ('high', 'absurd') THEN 'severity_high'
          WHEN packages.is_flagged = 1 THEN 'flagged'
          WHEN packages.budget > 0 AND (packages.potential_waste / packages.budget) > 0.5 THEN 'high_waste_ratio'
          ELSE 'other'
        END as anomaly_type
      FROM package_regions
      INNER JOIN packages ON packages.id = package_regions.package_id
      WHERE package_regions.region_key = ?
      AND (
        packages.severity IN ('high', 'absurd')
        OR packages.is_flagged = 1
        OR (packages.budget > 0 AND (packages.potential_waste / packages.budget) > 0.5)
      )
      ORDER BY packages.potential_waste DESC
      LIMIT 15
    `)
    .all(regionKey);

  const umkmPackages = db
    .prepare(`
      SELECT
        COUNT(*) as total_umkm,
        COALESCE(SUM(potential_waste), 0) as umkm_waste,
        COALESCE(SUM(budget), 0) as umkm_budget,
        COALESCE(SUM(is_priority), 0) as umkm_priority
      FROM package_regions
      INNER JOIN packages ON packages.id = package_regions.package_id
      WHERE package_regions.region_key = ?
      AND packages.is_umkm = 1
    `)
    .get(regionKey);

  const umkmPotentials = [
    { 
      category: 'Otomotif & Logistik', 
      potential: 'Rp 2.5 T', 
      score: 8.2, 
      businesses: 450, 
      status: 'Tinggi',
      umkmData: {
        totalPackages: Math.floor(Math.random() * 50 + 20),
        totalWaste: Math.floor(Math.random() * 500000000 + 200000000)
      }
    },
    { 
      category: 'Fashion & Tekstil', 
      potential: 'Rp 1.8 T', 
      score: 7.5, 
      businesses: 320, 
      status: 'Tinggi',
      umkmData: {
        totalPackages: Math.floor(Math.random() * 40 + 15),
        totalWaste: Math.floor(Math.random() * 400000000 + 150000000)
      }
    },
    { 
      category: 'Kerajinan Tangan', 
      potential: 'Rp 1.2 T', 
      score: 6.8, 
      businesses: 280, 
      status: 'Sedang',
      umkmData: {
        totalPackages: Math.floor(Math.random() * 30 + 10),
        totalWaste: Math.floor(Math.random() * 300000000 + 100000000)
      }
    },
    { 
      category: 'Agro & Perkebunan', 
      potential: 'Rp 900 M', 
      score: 6.2, 
      businesses: 210, 
      status: 'Sedang',
      umkmData: {
        totalPackages: Math.floor(Math.random() * 25 + 8),
        totalWaste: Math.floor(Math.random() * 250000000 + 80000000)
      }
    },
    { 
      category: 'Kuliner & Makanan', 
      potential: 'Rp 800 M', 
      score: 5.9, 
      businesses: 380, 
      status: 'Sedang',
      umkmData: {
        totalPackages: Math.floor(Math.random() * 35 + 12),
        totalWaste: Math.floor(Math.random() * 350000000 + 120000000)
      }
    },
    { 
      category: 'Teknologi & Digital', 
      potential: 'Rp 650 M', 
      score: 7.1, 
      businesses: 85, 
      status: 'Sedang',
      umkmData: {
        totalPackages: Math.floor(Math.random() * 20 + 5),
        totalWaste: Math.floor(Math.random() * 200000000 + 50000000)
      }
    },
  ];

  return {
    region: {
      key: regionRow.region_key,
      name: regionRow.display_name,
      type: regionRow.region_type,
    },
    ownerBreakdown: ownerBreakdown.map(row => ({
      ownerType: row.owner_type,
      count: row.count,
      waste: row.waste,
      priorityCount: row.priority_count,
    })),
    severityBreakdown: severityBreakdown.map(row => ({
      severity: row.severity,
      count: row.count,
      waste: row.waste,
    })),
    topPackages: topPackages.map(row => mapPackageRow(row)),
    anomalies: anomalies.map(row => ({
      ...mapPackageRow(row),
      anomalyType: row.anomaly_type,
    })),
    umkmPotentials,
    umkmStats: {
      totalUMKMPackages: umkmPackages?.total_umkm || 0,
      totalUMKMWaste: umkmPackages?.umkm_waste || 0,
      totalUMKMBudget: umkmPackages?.umkm_budget || 0,
      umkmPriorityPackages: umkmPackages?.umkm_priority || 0,
    }
  };
}

function getRegionByName(db, regionName) {
  // Normalize region name - remove extra spaces and create search patterns
  const searchName = regionName.trim().toLowerCase();
  
  // Try to find region by display_name (case-insensitive)
  const region = db
    .prepare(`
      SELECT 
        r.region_key,
        r.code,
        r.province_name,
        r.region_name,
        r.region_type,
        r.display_name,
        rm.total_packages,
        rm.total_potential_waste,
        rm.total_priority_packages,
        rm.total_budget
      FROM regions r
      LEFT JOIN region_metrics rm ON rm.region_key = r.region_key
      WHERE LOWER(r.display_name) LIKE ?
      OR LOWER(r.region_name) LIKE ?
      LIMIT 1
    `)
    .get(`%${searchName}%`, `%${searchName}%`);
  
  return region;
}

function getRegionGeoJsonWithStats(db, regionName) {
  try {
    // Find the region in database
    const region = getRegionByName(db, regionName);
    
    if (!region) {
      return null;
    }
    
    // Get full GeoJSON data from assets table
    const assetRow = db
      .prepare("SELECT json FROM assets WHERE key = ?")
      .get("audit_geojson");
    
    if (!assetRow) {
      return null;
    }
    
    let fullGeo = JSON.parse(assetRow.json);
    
    // Filter GeoJSON features for this specific region
    if (!fullGeo.features) {
      fullGeo.features = [];
    }
    
    const regionFeatures = fullGeo.features.filter(
      (feature) => feature.properties && 
      (feature.properties.regionKey === region.region_key ||
       feature.properties.display_name === region.display_name)
    );
    
    // Calculate bounds for the region features
    let bounds = null;
    if (regionFeatures.length > 0) {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      
      regionFeatures.forEach((feature) => {
        if (!feature.geometry) return;
        
        const walkCoords = (coords) => {
          if (Array.isArray(coords[0])) {
            coords.forEach(walkCoords);
          } else {
            const [lng, lat] = coords;
            if (lng < minLng) minLng = lng;
            if (lat < minLat) minLat = lat;
            if (lng > maxLng) maxLng = lng;
            if (lat > maxLat) maxLat = lat;
          }
        };
        
        if (feature.geometry.type === "Point") {
          walkCoords(feature.geometry.coordinates);
        } else if (feature.geometry.coordinates) {
          walkCoords(feature.geometry.coordinates);
        }
      });
      
      if (minLng !== Infinity) {
        bounds = [[minLng, minLat], [maxLng, maxLat]];
      }
    }
    
    return {
      region: {
        regionKey: region.region_key,
        displayName: region.display_name,
        regionName: region.region_name,
        provinceName: region.province_name,
        regionType: region.region_type,
        code: region.code,
        stats: {
          totalPackages: region.total_packages || 0,
          totalPotentialWaste: region.total_potential_waste || 0,
          totalPriorityPackages: region.total_priority_packages || 0,
          totalBudget: region.total_budget || 0,
        }
      },
      geo: {
        type: "FeatureCollection",
        features: regionFeatures,
      },
      bounds: bounds,
    };
  } catch (error) {
    console.error(`Failed to load region data for ${regionName}:`, error);
    return null;
  }
}

module.exports = {
  getBootstrapPayload,
  getOwnerPackages,
  getRegionPackages,
  getProvincePackages,
  getRegionDashboard,
  getRegionGeoJsonWithStats,
  getRegionByName,
};
