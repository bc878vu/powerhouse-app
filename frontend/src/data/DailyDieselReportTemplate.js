export const DAILY_DIESEL_REPORT_TEMPLATE={
  title:"Daily Diesel Consuption & Generator Running  Report",
  company:"Future fashion (pvt.) ltd LHR",
  sheetName:"Diesel Report",
  columns:20,
  headerRows:[
    ["Date ","Generator Run Time","","","","","","KWh","","","Fuel Consuptions","","","Duration","","","Fuel Stock In Liter","","",""] ,
    ["","1400 kva","","1020 kva","","650 KVA","","","","","","","","","","","Lif & MC","Consumed"," Stock","Incoming"],
    ["","ON","OFF","ON","OFF","ON","OFF","1400 kva","1020 kva","650 kva","1400 kva","1020 kva","650 kva","1400 kva","1020 kva","650 kva","","","",""]
  ],
  merges:[
    ["A1:T1"],["A2:T2"],["A3:A5"],["B3:G3"],["B4:C4"],["D4:E4"],["F4:G4"],
    ["H3:J4"],["K3:M4"],["N3:P4"],["Q3:T3"],["Q4:Q5"],["R4:R5"],["S4:S5"],["T4:T5"]
  ]
};
