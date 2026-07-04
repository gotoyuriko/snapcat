import { Request, Response, NextFunction } from 'express';
import { gpsResponseGuard, stripRawGpsFields } from '../../middleware/gpsResponseGuard';

describe('gpsResponseGuard middleware', () => {
  describe('stripRawGpsFields', () => {
    it('strips rawLat and rawLng fields from objects', () => {
      const input = { id: '1', rawLat: 3.1234, rawLng: 101.5678, name: 'Kitty' };
      const result = stripRawGpsFields(input);
      expect(result).toEqual({ id: '1', name: 'Kitty' });
    });

    it('strips bare lat and lng numeric fields', () => {
      const input = { id: '1', lat: 3.1234, lng: 101.5678, name: 'Kitty' };
      const result = stripRawGpsFields(input);
      expect(result).toEqual({ id: '1', name: 'Kitty' });
    });

    it('strips bare latitude and longitude numeric fields', () => {
      const input = { id: '1', latitude: 3.1234, longitude: 101.5678 };
      const result = stripRawGpsFields(input);
      expect(result).toEqual({ id: '1' });
    });

    it('preserves fuzzedLat and fuzzedLng fields', () => {
      const input = { id: '1', fuzzedLat: 3.124, fuzzedLng: 101.568 };
      const result = stripRawGpsFields(input);
      expect(result).toEqual({ id: '1', fuzzedLat: 3.124, fuzzedLng: 101.568 });
    });

    it('preserves approxLat and approxLng fields', () => {
      const input = { catId: 'c1', approxLat: 3.124, approxLng: 101.568, discovered: true };
      const result = stripRawGpsFields(input);
      expect(result).toEqual({ catId: 'c1', approxLat: 3.124, approxLng: 101.568, discovered: true });
    });

    it('preserves lastKnownApproxLat and lastKnownApproxLng fields', () => {
      const input = { id: 'c1', lastKnownApproxLat: 3.124, lastKnownApproxLng: 101.568 };
      const result = stripRawGpsFields(input);
      expect(result).toEqual({ id: 'c1', lastKnownApproxLat: 3.124, lastKnownApproxLng: 101.568 });
    });

    it('strips raw GPS from nested objects', () => {
      const input = {
        cat: { id: 'c1', name: 'Milo', rawLat: 3.1, rawLng: 101.5 },
        sightings: [
          { id: 's1', fuzzedLat: 3.12, fuzzedLng: 101.56, lat: 3.1, lng: 101.5 },
        ],
      };
      const result = stripRawGpsFields(input);
      expect(result).toEqual({
        cat: { id: 'c1', name: 'Milo' },
        sightings: [
          { id: 's1', fuzzedLat: 3.12, fuzzedLng: 101.56 },
        ],
      });
    });

    it('strips raw GPS from arrays of objects', () => {
      const input = [
        { catId: 'c1', lat: 3.1, lng: 101.5, fuzzedLat: 3.12, fuzzedLng: 101.56 },
        { catId: 'c2', rawLat: 3.2, rawLng: 101.6, approxLat: 3.21, approxLng: 101.61 },
      ];
      const result = stripRawGpsFields(input);
      expect(result).toEqual([
        { catId: 'c1', fuzzedLat: 3.12, fuzzedLng: 101.56 },
        { catId: 'c2', approxLat: 3.21, approxLng: 101.61 },
      ]);
    });

    it('handles null and undefined values gracefully', () => {
      expect(stripRawGpsFields(null)).toBeNull();
      expect(stripRawGpsFields(undefined)).toBeUndefined();
    });

    it('handles primitive values', () => {
      expect(stripRawGpsFields(42)).toBe(42);
      expect(stripRawGpsFields('hello')).toBe('hello');
      expect(stripRawGpsFields(true)).toBe(true);
    });

    it('does not strip lat/lng when value is not a number (e.g. string label)', () => {
      const input = { lat: 'north', lng: 'east', name: 'label' };
      const result = stripRawGpsFields(input);
      // Non-numeric lat/lng are preserved (they are not coordinate data)
      expect(result).toEqual({ lat: 'north', lng: 'east', name: 'label' });
    });

    it('strips case-insensitive raw fields (rawLAT, RAWLNG)', () => {
      const input = { id: '1', rawLAT: 3.1, RAWLNG: 101.5 };
      const result = stripRawGpsFields(input);
      expect(result).toEqual({ id: '1' });
    });

    it('strips raw_lat and raw_lng snake_case variants', () => {
      const input = { id: '1', raw_lat: 3.1, raw_lng: 101.5 };
      const result = stripRawGpsFields(input);
      expect(result).toEqual({ id: '1' });
    });
  });

  describe('middleware integration', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let jsonSpy: jest.Mock;

    beforeEach(() => {
      mockReq = {};
      jsonSpy = jest.fn().mockReturnThis();
      mockRes = {
        json: jsonSpy,
      } as any;
      mockNext = jest.fn();
    });

    it('intercepts res.json and strips raw GPS fields', () => {
      gpsResponseGuard(mockReq as Request, mockRes as Response, mockNext);

      // After middleware runs, next() should have been called
      expect(mockNext).toHaveBeenCalled();

      // Call res.json with a body that contains raw GPS
      (mockRes as Response).json!({ id: '1', rawLat: 3.1, rawLng: 101.5, fuzzedLat: 3.12, fuzzedLng: 101.56 });

      // The original json spy should have been called with sanitised data
      expect(jsonSpy).toHaveBeenCalledWith({ id: '1', fuzzedLat: 3.12, fuzzedLng: 101.56 });
    });

    it('passes through null/undefined body unchanged', () => {
      gpsResponseGuard(mockReq as Request, mockRes as Response, mockNext);

      (mockRes as Response).json!(null);
      expect(jsonSpy).toHaveBeenCalledWith(null);
    });

    it('passes through bodies with only safe GPS fields', () => {
      gpsResponseGuard(mockReq as Request, mockRes as Response, mockNext);

      const body = { catId: 'c1', approxLat: 3.12, approxLng: 101.56, discovered: true };
      (mockRes as Response).json!(body);
      expect(jsonSpy).toHaveBeenCalledWith(body);
    });
  });
});
