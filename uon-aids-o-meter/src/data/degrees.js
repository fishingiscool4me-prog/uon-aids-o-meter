export const DEGREES = {
  Mechanical: [
    { code: "CIVL1100", name: "Fundamentals of Engineering Mechanics" },
    { code: "ELEC1310", name: "Introduction to Electrical Engineering" },
    { code: "ENGG1003", name: "Introduction to Procedural Programming" },
    { code: "ENGG1500", name: "Introduction to Professional Engineering" },
    { code: "MATH1110", name: "Mathematics for Engineering, Science and Technology 1" },
    { code: "MATH1120", name: "Mathematics for Engineering, Science and Technology 2" },
    { code: "MECH1110", name: "Introduction to Mechanical Engineering Design" },
    { code: "MECH1750", name: "Engineering Materials 1" },
    { code: "ENGG2100", name: "Engineering Risk and Uncertainty" },
    { code: "ENGG2300", name: "Engineering Fluid Mechanics" },
    { code: "ENGG2440", name: "Modelling and Control" },
    { code: "ENGG2500", name: "Sustainable Engineering Practice" },
    { code: "MATH2310", name: "Calculus of Science and Engineering" },
    { code: "MECH2110", name: "Mechanical Engineering Design 1" },
    { code: "MECH2360", name: "Dynamics of Machines" },
    { code: "MECH2430", name: "Mechanics of Solids 1" },
    { code: "ENGG3000", name: "Engineering Work Integrated Learning" },
    { code: "ENGG3050", name: "Work Experience in Industry" },
    { code: "ENGG3300", name: "Machine Learning for Engineers" },
    { code: "ENGG3500", name: "Managing Engineering Projects" },
    { code: "MECH3110", name: "Mechanical Engineering Design 2" },
    { code: "MECH3400", name: "Materials Science and Engineering 2" },
    { code: "MECH3695", name: "Heat Transfer" },
    { code: "MECH3720", name: "Thermodynamics" },
    { code: "MECH3780", name: "Fluid Mechanics 2 and CFD" },
    { code: "MECH4410", name: "Mechanics of Solids 2 and FEA" },
    { code: "MECH4841A", name: "Mechanical Engineering Project A" },
    { code: "MECH4841B", name: "Mechanical Engineering Project B" }
  ],
  Mechatronics: [
    { code: "CIVL1100", name: "Fundamentals of Engineering Mechanics" },
    { code: "ELEC1310", name: "Introduction to Electrical Engineering" },
    { code: "ELEC1710", name: "Digital and Computer Electronics 1" },
    { code: "ENGG1003", name: "Introduction to Procedural Programming" },
    { code: "ENGG1500", name: "Introduction to Professional Engineering" },
    { code: "MATH1110", name: "Mathematics for Engineering, Science and Technology 1" },
    { code: "MATH1120", name: "Mathematics for Engineering, Science and Technology 2" },
    { code: "MECH1110", name: "Introduction to Mechanical Engineering Design" },
    { code: "MECH1750", name: "Engineering Materials 1" },
    { code: "ELEC2320", name: "Electrical and Electronic Circuits" },
    { code: "ELEC2430", name: "Circuits and Signals" },
    { code: "ENGG2100", name: "Engineering Risk and Uncertainty" },
    { code: "ENGG2300", name: "Engineering Fluid Mechanics" },
    { code: "ENGG2440", name: "Modelling and Control" },
    { code: "ENGG2500", name: "Sustainable Engineering Practice" },
    { code: "MATH2310", name: "Calculus of Science and Engineering" },
    { code: "MECH2110", name: "Mechanical Engineering Design 1" },
    { code: "MECH2360", name: "Dynamics of Machines" },
    { code: "AERO3600", name: "Embedded Control Systems" },
    { code: "ENGG3000", name: "Engineering Work Integrated Learning" },
    { code: "ENGG3050", name: "Work Experience in Industry" },
    { code: "ENGG3300", name: "Machine Learning for Engineers" },
    { code: "ENGG3500", name: "Managing Engineering Projects" },
    { code: "MCHA3400", name: "Embedded Systems Engineering" },
    { code: "MCHA3500", name: "Mechatronics Design 1" },
    { code: "ENGG4801A", name: "Engineering Final Year Project A" },
    { code: "ENGG4801B", name: "Engineering Final Year Project B" },
    { code: "MCHA4100", name: "Mechatronics Systems" },
    { code: "MCHA4400", name: "Vision-based Navigation" }
  ]
}

// Helpers for the UI
export function prefixesForDegree(degreeName){
  const list = DEGREES[degreeName] || []
  const set = new Set(list.map(c => c.code.match(/^[A-Z]+/)[0]))
  return Array.from(set).sort()
}
