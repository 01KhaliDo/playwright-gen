// =============================================================================
// excel.ts — Framtida integration: läs testfall från Excel-fil
//
// PLACEHOLDER — Inte implementerad ännu.
// I framtiden kan du lägga till din Excel-fil här och låta AI:n
// använda testfallsbeskrivningarna som komplement till crawl-datan.
//
// Förslag på implementation:
//   import XLSX from 'xlsx';
//   const workbook = XLSX.readFile('testcases.xlsx');
//   const sheet = workbook.Sheets[workbook.SheetNames[0]];
//   const rows = XLSX.utils.sheet_to_json(sheet);
//   // rows = [{ TestCase: "...", ExpectedResult: "...", Priority: "High" }, ...]
// =============================================================================

export interface ExcelTestCase {
    name: string;
    description: string;
    expectedResult: string;
    priority?: 'High' | 'Medium' | 'Low';
}

/**
 * Läser testfall från en Excel-fil (inte implementerad ännu).
 * @param filePath Sökväg till .xlsx-filen
 */
export async function readExcelTestCases(filePath: string): Promise<ExcelTestCase[]> {
    // TODO: Implementera med xlsx-paketet
    // npm install xlsx @types/xlsx
    console.warn('Excel integration is not yet implemented. File:', filePath);
    return [];
}
