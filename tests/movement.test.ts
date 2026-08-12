import { describe, it, expect } from "vitest";
import { makeTestState, addUnit, setTerrain } from "./helpers";
import { reachableTiles } from "../src/engine/movement";
import { applyAction } from "../src/engine/reducer";

const has = (tiles: Array<[number, number]>, x: number, y: number) =>
  tiles.some(([tx, ty]) => tx === x && ty === y);

describe("movement", () => {
  it("warrior on open ground reaches all 8 neighbours", () => {
    const s = makeTestState();
    const u = addUnit(s, 0, "warrior", 4, 4);
    const tiles = reachableTiles(s, u);
    expect(tiles.length).toBe(8);
  });

  it("rider (2 movement) reaches up to 2 tiles out", () => {
    const s = makeTestState();
    s.players[0].techs.push("riding");
    const u = addUnit(s, 0, "rider", 4, 4);
    const tiles = reachableTiles(s, u);
    expect(has(tiles, 6, 4)).toBe(true);
    expect(has(tiles, 2, 6)).toBe(true);
    expect(has(tiles, 7, 4)).toBe(false);
  });

  it("mountains are blocked without climbing", () => {
    const s = makeTestState();
    setTerrain(s, 4, 5, "mountain");
    const u = addUnit(s, 0, "warrior", 4, 4);
    expect(has(reachableTiles(s, u), 4, 5)).toBe(false);
    s.players[0].techs.push("climbing");
    expect(has(reachableTiles(s, u), 4, 5)).toBe(true);
  });

  it("forest stops a rider's movement on entry", () => {
    const s = makeTestState();
    s.players[0].techs.push("riding");
    setTerrain(s, 4, 5, "forest");
    const u = addUnit(s, 0, "rider", 4, 4);
    const tiles = reachableTiles(s, u);
    expect(has(tiles, 4, 5)).toBe(true);
    expect(has(tiles, 4, 6)).toBe(true); // reachable around, not through
  });

  it("water is blocked without a friendly port to board", () => {
    const s = makeTestState();
    setTerrain(s, 4, 5, "water");
    const u = addUnit(s, 0, "warrior", 4, 4);
    expect(has(reachableTiles(s, u), 4, 5)).toBe(false);
  });

  it("a land unit embarks by stepping aboard an own port on water", () => {
    const s = makeTestState();
    const c = s.cities[0]; // owner 0 at (1,1); territory covers (2,2)
    setTerrain(s, 2, 2, "water"); // port tile
    setTerrain(s, 3, 2, "water"); // open water beyond it
    const portTile = s.tiles[2 * s.size + 2]; // (2,2) inside territory
    portTile.building = "port";
    expect(portTile.cityId).toBe(c.id);
    const u = addUnit(s, 0, "warrior", 1, 2);
    const tiles = reachableTiles(s, u);
    expect(has(tiles, 2, 2)).toBe(true); // can board the port
    expect(has(tiles, 3, 2)).toBe(false); // boarding ends movement
  });

  it("an enemy port does not take a land unit aboard", () => {
    const s = makeTestState();
    setTerrain(s, 6, 5, "water");
    const portTile = s.tiles[5 * s.size + 6]; // (6,5) — enemy territory
    portTile.building = "port";
    expect(portTile.cityId).toBe(s.cities[1].id);
    const u = addUnit(s, 0, "warrior", 5, 5);
    expect(has(reachableTiles(s, u), 6, 5)).toBe(false);
  });

  it("cannot move through or onto occupied tiles", () => {
    const s = makeTestState();
    const u = addUnit(s, 0, "warrior", 4, 4);
    addUnit(s, 1, "warrior", 4, 5);
    expect(has(reachableTiles(s, u), 4, 5)).toBe(false);
  });

  it("entering a tile next to an enemy stops movement", () => {
    const s = makeTestState();
    s.players[0].techs.push("riding");
    const u = addUnit(s, 0, "rider", 4, 4);
    addUnit(s, 1, "warrior", 4, 7);
    const tiles = reachableTiles(s, u);
    expect(has(tiles, 4, 6)).toBe(true); // adjacent to enemy — enterable
    // but cannot continue past it diagonally to 5,7 in the same move
    // (5,7 is adjacent to the enemy too, so reachable only via a stopped tile)
    expect(has(tiles, 4, 7)).toBe(false); // occupied
  });
});

describe("embarking", () => {
  /** Own port on water at (2,2), warrior ashore at (1,2). */
  function portState() {
    const s = makeTestState();
    setTerrain(s, 2, 2, "water");
    s.tiles[2 * s.size + 2].building = "port";
    const u = addUnit(s, 0, "warrior", 1, 2);
    return { s, u };
  }

  it("boarding a port turns the unit into a raft", () => {
    const { s, u } = portState();
    const next = applyAction(s, { type: "MOVE", unitId: u.id, x: 2, y: 2 });
    expect(next.units.find((n) => n.id === u.id)!.embarked).toBe("raft");
  });

  it("boarding with Sailing launches a ship directly", () => {
    const { s, u } = portState();
    s.players[0].techs.push("sailing");
    const next = applyAction(s, { type: "MOVE", unitId: u.id, x: 2, y: 2 });
    expect(next.units.find((n) => n.id === u.id)!.embarked).toBe("ship");
  });

  it("stepping back ashore disembarks", () => {
    const { s, u } = portState();
    const afloat = applyAction(s, { type: "MOVE", unitId: u.id, x: 2, y: 2 });
    afloat.units.find((n) => n.id === u.id)!.moved = false;
    const ashore = applyAction(afloat, { type: "MOVE", unitId: u.id, x: 1, y: 2 });
    expect(ashore.units.find((n) => n.id === u.id)!.embarked).toBe(null);
  });
});
