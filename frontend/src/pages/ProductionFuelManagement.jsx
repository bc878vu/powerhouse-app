import React from "react";
import FuelReportAutoSave from "./FuelReportAutoSave";
import GeneratorOperationalData from "./GeneratorOperationalData";

export default function ProductionFuelManagement(){
  return <>
    <GeneratorOperationalData />
    <FuelReportAutoSave />
  </>;
}
