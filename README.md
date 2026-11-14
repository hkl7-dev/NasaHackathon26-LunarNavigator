
# Lunar Landing Site Evaluator – Model Assumptions

**Status:** Engineering estimates – not specifications for a particular lander.

## 1. Physical constants
- Solar constant: 1361 W/m² at 1 AU.
- Seasonal variation: approximately ±3%, accounted for through Sun distance.

## 2. Solar power system
- Panel orientation: Vertical tracking.
- Solar array area: 2.0 m².
- Solar cell efficiency: 30%.
- System derating factor: 0.85.
- Derating includes estimated packing, temperature, dust, degradation, wiring and MPPT losses.
- Fixed panel azimuth: 0°, only applicable to vertical-fixed mode.

## 3. Battery and power consumption
- Battery capacity: 3000 Wh.
- Initial state of charge: 100%.
- Maximum depth of discharge: 80%.
- Charging efficiency: 95%.
- Discharging efficiency: 95%.
- Daytime science load: 150 W.
- Night survival load: 40 W.
- Battery specific energy: 150 Wh/kg.
- Minimum permitted state of charge: 20%.

## 4. Communications system
- Frequency band: X-band.
- Operating frequency: 8.45 GHz.
- Transmitter RF power: 15 W.
- Transmitter antenna gain: 20 dBi.
- Transmission losses: 2 dB.
- Receiver G/T: 53 dB/K.
- Required Eb/N0: 2.5 dB.
- Link margin: 3 dB.
- Minimum Earth elevation above terrain horizon: 1°.
- Maximum hardware data rate: 2 Mbps.
- Assumed receiver: DSN 34 m beam-waveguide station.

## 5. Dataset
- Current Haworth dataset is synthetic test data.
- It is used to verify software integration.
- It must not be treated as actual lunar environmental measurements.

## 6. Limitations
- Solar generation depends on simplified illumination and panel-orientation models.
- Battery thermal behaviour and detailed battery ageing are not modelled.
- Communications use a simplified link-budget calculation.
- Hardware parameters are engineering estimates, not validated flight-system specifications.

## 7. Mentor verification
The following assumptions require mentor confirmation:
- Solar array derating factor.
- Typical lunar-night survival heater load.
- DSN receiver G/T and link assumptions.
- Minimum Earth elevation margin.

Mark each confirmed assumption as **mentor-checked** after verification.
