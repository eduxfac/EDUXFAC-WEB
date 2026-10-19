import ExcelJS from 'exceljs';
import {readFile,writeFile} from 'node:fs/promises';
const base='docs/physical_count_excel/';const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(base+'Conteo_Fisico_FICTICIO_QA.xlsx');
const {rows}=JSON.parse(await readFile('operations/physical-count-excel/QA_ROWS.json','utf8'));const ws=wb.getWorksheet('Conteo físico');
for(const [code,physical]of Object.entries({'COUNT-LESS':95,'COUNT-MORE':105,'COUNT-EQUAL':100,'COUNT-DECIMAL':95.125,'P-A':95,'COUNT-UNKNOWN':15}))ws.getCell('E'+rows[code]).value=physical;
wb.calcProperties.fullCalcOnLoad=true;await wb.xlsx.writeFile(base+'Conteo_Fisico_FICTICIO_MATRIZ.xlsx');
