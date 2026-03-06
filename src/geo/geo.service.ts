import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GeoService implements OnModuleInit {
  private readonly logger = new Logger(GeoService.name);
  private postgisAvailable = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis');
      this.postgisAvailable = true;
      this.logger.log('PostGIS extension enabled');
    } catch (e) {
      this.logger.warn('PostGIS not available. Spatial queries will use fallback math.');
    }
  }

  get isAvailable(): boolean {
    return this.postgisAvailable;
  }

  /**
   * Finds all records within a radius (meters) of a point.
   * Works with any table that has lat/lng columns.
   */
  async findWithinRadius(
    table: string,
    latColumn: string,
    lngColumn: string,
    centerLat: number,
    centerLng: number,
    radiusMeters: number,
    extraWhere = '',
  ): Promise<any[]> {
    if (this.postgisAvailable) {
      const query = `
        SELECT *, ST_Distance(
          ST_SetSRID(ST_MakePoint(${lngColumn}::float, ${latColumn}::float), 4326)::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) AS distance_meters
        FROM "${table}"
        WHERE ${latColumn} IS NOT NULL AND ${lngColumn} IS NOT NULL
        ${extraWhere ? `AND ${extraWhere}` : ''}
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(${lngColumn}::float, ${latColumn}::float), 4326)::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
        ORDER BY distance_meters ASC
      `;
      return this.prisma.$queryRawUnsafe(query, centerLng, centerLat, radiusMeters);
    }

    // Fallback: Haversine formula (less accurate but no PostGIS needed)
    const query = `
      SELECT *, (
        6371000 * acos(
          cos(radians($1)) * cos(radians(${latColumn}::float)) *
          cos(radians(${lngColumn}::float) - radians($2)) +
          sin(radians($1)) * sin(radians(${latColumn}::float))
        )
      ) AS distance_meters
      FROM "${table}"
      WHERE ${latColumn} IS NOT NULL AND ${lngColumn} IS NOT NULL
      ${extraWhere ? `AND ${extraWhere}` : ''}
      HAVING distance_meters <= $3
      ORDER BY distance_meters ASC
    `;
    return this.prisma.$queryRawUnsafe(query, centerLat, centerLng, radiusMeters);
  }

  /**
   * Checks if a point is inside a GeoJSON polygon.
   * Uses PostGIS ST_Contains or fallback ray-casting.
   */
  async isPointInZone(lat: number, lng: number, zoneId: string): Promise<boolean> {
    if (this.postgisAvailable) {
      const result: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT EXISTS(
          SELECT 1 FROM "Zone"
          WHERE id = $1
          AND "polygonGeojson" IS NOT NULL
          AND ST_Contains(
            ST_SetSRID(ST_GeomFromGeoJSON("polygonGeojson"::text), 4326),
            ST_SetSRID(ST_MakePoint($2, $3), 4326)
          )
        ) AS "isInside"
      `, zoneId, lng, lat);
      return result[0]?.isInside === true;
    }

    // Fallback: fetch polygon and do ray-casting in JS
    const zone = await this.prisma.zone.findUnique({
      where: { id: zoneId },
      select: { polygonGeojson: true },
    });
    if (!zone?.polygonGeojson) return false;
    return this.pointInPolygonFallback(lat, lng, zone.polygonGeojson as any);
  }

  /**
   * Finds which zone a point belongs to.
   */
  async findZoneForPoint(lat: number, lng: number): Promise<string | null> {
    if (this.postgisAvailable) {
      const result: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT id FROM "Zone"
        WHERE active = true
        AND "polygonGeojson" IS NOT NULL
        AND ST_Contains(
          ST_SetSRID(ST_GeomFromGeoJSON("polygonGeojson"::text), 4326),
          ST_SetSRID(ST_MakePoint($1, $2), 4326)
        )
        LIMIT 1
      `, lng, lat);
      return result[0]?.id || null;
    }

    // Fallback: check all active zones
    const zones = await this.prisma.zone.findMany({
      where: { active: true, polygonGeojson: { not: undefined } },
      select: { id: true, polygonGeojson: true },
    });

    for (const zone of zones) {
      if (this.pointInPolygonFallback(lat, lng, zone.polygonGeojson as any)) {
        return zone.id;
      }
    }
    return null;
  }

  /**
   * Calculates distance between two points in meters.
   */
  async distanceBetween(
    lat1: number, lng1: number,
    lat2: number, lng2: number,
  ): Promise<number> {
    if (this.postgisAvailable) {
      const result: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT ST_Distance(
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
        ) AS distance
      `, lng1, lat1, lng2, lat2);
      return result[0]?.distance || 0;
    }

    // Haversine fallback
    const R = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private pointInPolygonFallback(lat: number, lng: number, geojson: any): boolean {
    try {
      const coords = geojson?.coordinates?.[0] || geojson?.geometry?.coordinates?.[0];
      if (!coords || !Array.isArray(coords)) return false;

      let inside = false;
      for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
        const xi = coords[i][1], yi = coords[i][0];
        const xj = coords[j][1], yj = coords[j][0];

        const intersect = ((yi > lng) !== (yj > lng)) &&
          (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    } catch {
      return false;
    }
  }
}
