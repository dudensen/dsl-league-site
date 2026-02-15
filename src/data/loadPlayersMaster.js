// src/data/loadPlayersMaster.js
import { fetchGviz, gvizToMatrix } from "./googleSheets";
import { playersFromPlayersMaster } from "./playersMasterFromSheet";
import { computeTeamPayrollByYear } from "../trade/teamPayroll";

const SHEET_ID = "146QdGaaB1Nt0HJXG_s8O0s5N0lQDfnWGmGsgNHEnCkQ";
const PLAYERS_GID = 284322669;

export async function loadPlayersMaster() {
  const gviz = await fetchGviz({ sheetId: SHEET_ID, gid: PLAYERS_GID });
  const { rows } = gvizToMatrix(gviz);

  const { players, years } = playersFromPlayersMaster({
    rows,
    headerRowIndex: 1,   // row2
    dataStartRowIndex: 2 // row3 onward
  });

  const teamPayrollByYear = computeTeamPayrollByYear({ players, years });

  return { players, years, teamPayrollByYear };
}