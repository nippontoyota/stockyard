import { parseDeliveredVins, normalizeVin, isValidVin } from "./stockyardLogic.js";

const csvData = `
column1,VIN,column3
val1,JTMBA38V70D123456,val3
val2,JTMBA38V70D123457,val4
`;

console.log(parseDeliveredVins(csvData));
