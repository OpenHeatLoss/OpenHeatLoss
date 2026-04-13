// client/src/App.jsx
import { useState, useEffect } from 'react';
import { api } from './utils/api';
import { calculateRoomVolume, calculateRoomFloorArea, calculateElementArea } from './utils/calculations';
import { HomeIcon, PlusIcon, SaveIcon, TrashIcon } from './components/common/Icons';
import ProjectDashboard from './components/project/ProjectDashboard';
import ProjectInfo from './components/project/ProjectInfo';
import NewProjectModal from './components/project/NewProjectModal';
import UValueLibrary from './components/project/UValueLibrary';
import RoomList from './components/rooms/RoomList';
import Summary from './components/calculations/Summary';
import RadiatorSizing from './components/calculations/RadiatorSizing';
import PipeSizing from './components/pipesizing/PipeSizing';
import MCS031PerformanceEstimator from './components/mcs/MCS031PerformanceEstimator';
import MCS020SoundCalculator from './components/mcs/MCS020SoundCalculator';
import QuoteBuilder from './components/quote/QuoteBuilder';
import SettingsPage from './components/settings/SettingsPage';
import { getMCSDataFromPostcode } from './utils/mcsData';

function App() {
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [activeTab, setActiveTab] = useState('project');
  const [saving, setSaving] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // Auth state
  const [currentUser, setCurrentUser] = useState(null);   // { id, email, name, companyId, plan }
  const [currentCompany, setCurrentCompany] = useState(null); // { id, name, mcs_number, ... }
  const [showAuthModal, setShowAuthModal] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Derived: pro and beta users can access the project dashboard.
  // Set plan = 'beta' in Railway Postgres to grant early-access engineers dashboard access.
  const canSeeDashboard = currentUser?.plan === 'pro' || currentUser?.plan === 'beta';

  // Boot sequence:
  // 1. Check if already logged in (auth_token cookie via /api/auth/me)
  // 2. If yes  → load their most recent project, registered mode
  // 3. If no   → check for / create anonymous session project
  useEffect(() => {
    const boot = async () => {
      try {
        // Step 1: are we already authenticated?
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const { user } = await meRes.json();
          setCurrentUser(user);
          setIsAnonymous(false);
          // Load company details for dashboard header
          try {
            const companyRes = await fetch('/api/company');
            if (companyRes.ok) setCurrentCompany(await companyRes.json());
          } catch { /* non-fatal */ }
          // Load their most recent project
          const projectsRes = await fetch('/api/projects');
          const userProjects = await projectsRes.json();
          if (userProjects.length > 0) {
            await loadProject(userProjects[0].id);
          }
          return;
        }
      } catch (err) {
        // Network error — fall through to anonymous
        console.warn('Auth check failed, proceeding anonymously:', err);
      }

      // Step 2: anonymous session
      try {
        let res = await fetch('/api/anonymous/project');
        let { projectId } = await res.json();
        if (!projectId) {
          res = await fetch('/api/anonymous/project', { method: 'POST' });
          ({ projectId } = await res.json());
        }
        if (projectId) {
          setIsAnonymous(true);
          await loadProject(projectId);
        }
        // If projectId is null the anonymous project creation failed —
        // leave currentProject null; the UI handles this gracefully.
      } catch (err) {
        console.error('Anonymous boot error:', err);
        // No fallback for anonymous users — loadProjects() requires auth.
      }
    };

    boot();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const handleRegister = async ({ name, email, password }) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Registration failed');
        return;
      }
      // Success — project was claimed server-side, reload it
      setCurrentUser(data.user);
      setIsAnonymous(false);
      setShowAuthModal(null);
      try {
        const companyRes = await fetch('/api/company');
        if (companyRes.ok) setCurrentCompany(await companyRes.json());
      } catch { /* non-fatal */ }
      if (data.projectId) {
        await loadProject(data.projectId);
      }
    } catch (err) {
      setAuthError('Network error — please try again');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async ({ email, password }) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Login failed');
        return;
      }
      setCurrentUser(data.user);
      setIsAnonymous(false);
      setShowAuthModal(null);
      try {
        const companyRes = await fetch('/api/company');
        if (companyRes.ok) setCurrentCompany(await companyRes.json());
      } catch { /* non-fatal */ }
      if (data.projectId) {
        await loadProject(data.projectId);
      }
    } catch (err) {
      setAuthError('Network error — please try again');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setCurrentUser(null);
    setCurrentCompany(null);
    setCurrentProject(null);
    setIsAnonymous(false);
    // Reload page so a fresh anonymous session is created
    window.location.reload();
  };

  const loadProject = async (id, preserveTab = false) => {
  try {
    const data = await api.getProject(id);
    const dp   = data.designParams || {};
    const cl   = data.client       || {};

    const project = {
      id:       data.id,
      name:     data.name,
      status:   data.status || 'enquiry',
      designer: data.designer || '',
      briefNotes: data.brief_notes || '',

      // Client
      clientId:          cl.id || null,
      customerTitle:     cl.title || '',
      customerFirstName: cl.first_name || '',
      customerSurname:   cl.surname || '',
      customerEmail:     cl.email || '',
      customerTelephone: cl.telephone || '',
      customerMobile:    cl.mobile || '',

      // Installation address
      ...(() => {
        const addr = (data.projectAddresses || []).find(a => a.is_primary)
                    || (data.projectAddresses || [])[0]
                    || {};
        return {
          installationAddressId: addr.id            || null,
          customerAddressLine1:  addr.address_line_1 || '',
          customerAddressLine2:  addr.address_line_2 || '',
          customerTown:          addr.town           || '',
          customerCounty:        addr.county         || '',
          customerPostcode:      addr.postcode        || '',
          customerWhat3words:    addr.what3words      || '',
        };
      })(),

      clientAddresses:  data.clientAddresses  || [],
      projectAddresses: data.projectAddresses || [],

      // Design params (read from design_params table)
      externalTemp:      dp.external_temp      ?? -3,
      annualAvgTemp:     dp.annual_avg_temp     ?? 7,
      airDensity:        dp.air_density         ?? 1.2,
      specificHeat:      dp.specific_heat       ?? 0.34,
      designFlowTemp:    dp.design_flow_temp    ?? 50,
      designReturnTemp:  dp.design_return_temp  ?? 40,

      mcsDegreeDays:     dp.mcs_degree_days     || 0,
      mcsOutdoorLowTemp: dp.mcs_outdoor_low_temp || 0,
      mcsPostcodePrefix: dp.mcs_postcode_prefix  || '',

      mcsHeatPumpType:       dp.mcs_heat_pump_type       || 'ASHP',
      mcsEmitterType:        dp.mcs_emitter_type          || 'existing_radiators',
      mcsSystemProvides:     dp.mcs_system_provides       || 'space_and_hw',
      mcsCylinderVolume:     dp.mcs_cylinder_volume       || 0,
      mcsPasteurizationFreq: dp.mcs_pasteurization_freq   || 0,
      mcsUFHType:            dp.mcs_ufh_type              || 'screed',
      mcsBedrooms:           dp.mcs_bedrooms              || 0,
      mcsOccupants:          dp.mcs_occupants             || 0,

      // Legacy ventilation fields — retained so existing saved data isn't lost
      useSAPVentilation:        dp.use_sap_ventilation         || false,
      buildingCategory:         dp.building_category           || 'B',
      dwellingType:             dp.dwelling_type               || 'semi_detached',
      numberOfStoreys:          dp.number_of_storeys           || 2,
      shelterFactor:            dp.shelter_factor              || 'normal',
      numberOfBedrooms:         dp.number_of_bedrooms          || 0,
      hasBlowerTest:            dp.has_blower_test             || false,
      sapAgeBand:               dp.sap_age_band                || 'H',
      airPermeabilityQ50:       dp.air_permeability_q50        || 10,
      numberOfChimneys:         dp.number_of_chimneys          || 0,
      numberOfOpenFlues:        dp.number_of_open_flues        || 0,
      numberOfIntermittentFans: dp.number_of_intermittent_fans || 0,
      numberOfPassiveVents:     dp.number_of_passive_vents     || 0,
      ventilationSystemType:    dp.ventilation_system_type     || 'natural',
      mvhrEfficiency:           dp.mvhr_efficiency             || 0,

      // EN 12831-1:2017 / CIBSE DHDG 2026 ventilation fields (migration 010)
      ventilationMethod:      dp.ventilation_method        || 'en12831_cibse2026',
      airPermeabilityMethod:  dp.air_permeability_method   || 'estimated',
      q50:                    dp.q50                       ?? 12.0,
      sapStructural:          dp.sap_structural             || 'masonry',
      sapFloor:               dp.sap_floor                  || 'other',
      sapWindowDraughtPct:    dp.sap_window_draught_pct    ?? 100,
      sapDraughtLobby:        dp.sap_draught_lobby         ?? 0,
      buildingStoreys:        dp.building_storeys           ?? 2,
      buildingShielding:      dp.building_shielding         || 'normal',
      referenceTemp:          dp.reference_temp             ?? 10.6,

      mcsHeatPumpSoundPower: dp.mcs_heat_pump_sound_power || 0,
      mcsSoundAssessments: (() => {
        let val = dp.mcs_sound_assessments;
        if (!val) return [];
        let attempts = 0;
        while (typeof val === 'string' && attempts < 5) {
          try { val = JSON.parse(val); } catch { return []; }
          attempts++;
        }
        return Array.isArray(val) ? val : [];
      })(),
      mcsSoundSnapshot: (() => {
        let val = dp.mcs_sound_snapshot;
        if (!val) return null;
        let attempts = 0;
        while (typeof val === 'string' && attempts < 5) {
          try { val = JSON.parse(val); } catch { return null; }
          attempts++;
        }
        return typeof val === 'object' ? val : null;
      })(),
      mcsCalculationSnapshot: (() => {
        let val = dp.mcs_calculation_snapshot;
        if (!val) return null;
        let attempts = 0;
        while (typeof val === 'string' && attempts < 5) {
          try { val = JSON.parse(val); } catch { return null; }
          attempts++;
        }
        return typeof val === 'object' ? val : null;
      })(),

      pipeSections: (() => {
        let val = dp.pipe_sections;
        if (!val) return [];
        let attempts = 0;
        while (typeof val === 'string' && attempts < 5) {
          try { val = JSON.parse(val); } catch { return []; }
          attempts++;
        }
        return Array.isArray(val) ? val : [];
      })(),

      heatPumpManufacturer:   dp.heat_pump_manufacturer    || '',
      heatPumpModel:          dp.heat_pump_model           || '',
      heatPumpRatedOutput:    dp.heat_pump_rated_output    || 0,
      heatPumpMinModulation:  dp.heat_pump_min_modulation  || 0,
      heatPumpFlowTemp:       dp.heat_pump_flow_temp       || 50,
      heatPumpReturnTemp:     dp.heat_pump_return_temp     || 40,

      heatPumpInternalVolume: dp.heat_pump_internal_volume ?? 0,
      bufferVesselVolume:     dp.buffer_vessel_volume      ?? 0,

      en14511TestPoints: (() => {
        const val = dp.en14511_test_points;
        if (!val) return [];
        try { return JSON.parse(val); } catch { return []; }
      })(),
      defrostPct: dp.defrost_pct ?? 5,

      epcSpaceHeatingDemand: dp.epc_space_heating_demand || 0,
      epcHotWaterDemand:     dp.epc_hot_water_demand     || 0,
      epcTotalFloorArea:     dp.epc_total_floor_area     || 0,

      uValueLibrary: data.uValueLibrary || [],
      radiatorSpecs: data.radiatorSpecs || [],
      rooms: (data.rooms || []).map(room => ({
        id:           room.id,
        name:         room.name,
        internalTemp: room.internal_temp,
        volume:       room.volume,
        floorArea:    room.floor_area,
        roomLength:   room.room_length || 0,
        roomWidth:    room.room_width  || 0,
        roomHeight:   room.room_height || 0,
        roomType:     room.room_type   || 'living_room',
        designConnectionType:     room.design_connection_type     || 'BOE',
        hasManualACHOverride:     room.has_manual_ach_override    || false,
        manualACH:                room.manual_ach                 || 0,
        extractFanFlowRate:       room.extract_fan_flow_rate      || 0,
        hasOpenFire:              room.has_open_fire              || false,
        radiatorScheduleComplete: room.radiator_schedule_complete || false,

        // Thermal bridging addition (CIBSE DHDG 2026 Table 2-9, migration 011)
        thermalBridgingAddition:  room.thermal_bridging_addition  ?? 0.10,

        // EN 12831-1:2017 ventilation inputs (migration 010)
        exposedEnvelopeM2:    room.exposed_envelope_m2      ?? 0,
        hasSuspendedFloor:    room.has_suspended_floor      ?? 0,
        isTopStorey:          room.is_top_storey             ?? 0,
        bgVentCount:          room.bg_vent_count             ?? 0,
        bgFanCount:           room.bg_fan_count              ?? 0,
        bgFlueSmallCount:     room.bg_flue_small_count      ?? 0,
        bgFlueLargeCount:     room.bg_flue_large_count      ?? 0,
        bgOpenFireCount:      room.bg_open_fire_count       ?? 0,
        continuousVentType:   room.continuous_vent_type      || 'none',
        continuousVentRateM3h:room.continuous_vent_rate_m3h ?? 0,
        mvhrEfficiency:       room.mvhr_efficiency           ?? 0,

        // Legacy ventilation sub-object (kept for backward compat with legacy calc path)
        ventilation: {
          minAirFlow:        room.min_air_flow,
          infiltrationRate:  room.infiltration_rate,
          mechanicalSupply:  room.mechanical_supply,
          mechanicalExtract: room.mechanical_extract,
        },
        elements: (room.elements || []).map(el => ({
          id:                    el.id,
          elementType:           el.element_type,
          description:           el.description,
          length:                el.length   || 0,
          height:                el.height   || 0,
          area:                  el.area,
          uValue:                el.u_value,
          tempFactor:            el.temp_factor,
          customDeltaT:          el.custom_delta_t,
          subtractFromElementId: el.subtract_from_element_id,
          includeInEnvelope:     el.include_in_envelope ?? 0,
        })),
        emitters: (room.emitters || []).map(em => ({
          id:             em.id,
          emitterType:    em.emitter_type,
          radiatorSpecId: em.radiator_spec_id,
          connectionType: em.connection_type,
          quantity:       em.quantity || 1,
          notes:          em.notes,
        })),
        radiatorSchedule: (room.radiatorSchedule || []).map(rs => ({
          id:               rs.id,
          radiator_spec_id: rs.radiator_spec_id,
          connection_type:  rs.connection_type,
          quantity:         rs.quantity,
          notes:            rs.notes,
          is_existing:      rs.is_existing,
          emitter_status:   rs.emitter_status || 'new',
          display_order:    rs.display_order,
          enclosure_factor: rs.enclosure_factor ?? 1.00,
          finish_factor:    rs.finish_factor   ?? 1.00,
          no_trv:           rs.no_trv          ?? 0,
        })),
        ufhSpecs: room.ufhSpecs ? {
          floorConstruction:     room.ufhSpecs.floor_construction      || 'screed',
          pipeSpacingMm:         room.ufhSpecs.pipe_spacing_mm         || 150,
          pipeOdM:               room.ufhSpecs.pipe_od_m               ?? 0.016,
          screedDepthAbovePipeM: room.ufhSpecs.screed_depth_above_pipe_m ?? 0.045,
          lambdaScreed:          room.ufhSpecs.lambda_screed            ?? 1.2,
          floorCovering:         room.ufhSpecs.floor_covering           || 'tiles',
          rLambda:               room.ufhSpecs.r_lambda                ?? 0.00,
          activeAreaFactor:      room.ufhSpecs.active_area_factor      ?? 1.00,
          zoneType:              room.ufhSpecs.zone_type               || 'occupied',
          notes:                 room.ufhSpecs.notes                   || '',
          ufhFlowTemp:           room.ufhSpecs.ufh_flow_temp           ?? 45,
          ufhReturnTemp:         room.ufhSpecs.ufh_return_temp         ?? 40,
          hasActuator:           room.ufhSpecs.has_actuator            ?? 0,
        } : null,
      })),
    };

    // If the project has a postcode but externalTemp is still at the seeded
    // default (-3), apply MCS data automatically and persist it.
    const postcode = project.customerPostcode;
    if (postcode && project.externalTemp === -3) {
      const mcs = getMCSDataFromPostcode(postcode);
      if (mcs) {
        project.externalTemp      = mcs.lowTemp;
        project.mcsDegreeDays     = mcs.degreeDays;
        project.mcsOutdoorLowTemp = mcs.lowTemp;
        api.updateDesignParams(id, {
          ...project,
          externalTemp:      mcs.lowTemp,
          mcsDegreeDays:     mcs.degreeDays,
          mcsOutdoorLowTemp: mcs.lowTemp,
        }).catch(err => console.error('MCS auto-apply failed:', err));
      }
    }
    setCurrentProject(project);
    if (!preserveTab) setActiveTab('project');
    } catch (error) {
            console.error('Error loading project:', error);
      }
    };

  const createNewProject = async () => {
    try {
      const newProject = await api.createProject({
        name: 'New Project',
        location: '',
        designer: '',
        externalTemp: -3,
        annualAvgTemp: 7,
        airDensity: 1.2,
        specificHeat: 0.34,
        mcsHeatPumpSoundPower: 0,
        mcsSoundAssessments: [],
        mcsBedrooms: 0,
        mcsOccupants: 0,
        pipeSections: [],
        heatPumpManufacturer: '',
        heatPumpModel: '',
        heatPumpRatedOutput: 0,
        heatPumpMinModulation: 0,
        heatPumpFlowTemp: 50,
        heatPumpReturnTemp: 40,
        // EN 12831-1:2017 ventilation defaults
        ventilationMethod:     'en12831_cibse2026',
        airPermeabilityMethod: 'estimated',
        q50:                   12.0,
        sapStructural:         'masonry',
        sapFloor:              'other',
        sapWindowDraughtPct:   100,
        sapDraughtLobby:       0,
        buildingStoreys:       2,
        buildingShielding:     'normal',
        referenceTemp:         10.6,
      });
      await loadProjects();
      await loadProject(newProject.id);
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const saveProject = async () => {
  if (!currentProject) return;
  setSaving(true);
  try {
    // Save 1: project core fields
    await api.updateProject(currentProject.id, {
      name:       currentProject.name,
      status:     currentProject.status,
      designer:   currentProject.designer,
      briefNotes: currentProject.briefNotes,
    });

    // Save 2: client fields (if client is linked)
    if (currentProject.clientId) {
      await api.updateClient(currentProject.clientId, {
        title:     currentProject.customerTitle,
        firstName: currentProject.customerFirstName,
        surname:   currentProject.customerSurname,
        email:     currentProject.customerEmail,
        telephone: currentProject.customerTelephone,
        mobile:    currentProject.customerMobile,
      });
    }

    // Save the installation address if we have one
    if (currentProject.installationAddressId) {
      await api.updateAddress(currentProject.installationAddressId, {
        addressLine1: currentProject.customerAddressLine1,
        addressLine2: currentProject.customerAddressLine2,
        town:         currentProject.customerTown,
        county:       currentProject.customerCounty,
        postcode:     currentProject.customerPostcode,
        what3words:   currentProject.customerWhat3words,
      });
    }

    // Save 3: all design/technical data
    await api.updateDesignParams(currentProject.id, {
      externalTemp:      currentProject.externalTemp,
      annualAvgTemp:     currentProject.annualAvgTemp,
      airDensity:        currentProject.airDensity,
      specificHeat:      currentProject.specificHeat,
      designFlowTemp:    currentProject.designFlowTemp,
      designReturnTemp:  currentProject.designReturnTemp,
      mcsPostcodePrefix: currentProject.mcsPostcodePrefix,
      mcsDegreeDays:     currentProject.mcsDegreeDays,
      mcsOutdoorLowTemp: currentProject.mcsOutdoorLowTemp,
      mcsHeatPumpType:       currentProject.mcsHeatPumpType,
      mcsEmitterType:        currentProject.mcsEmitterType,
      mcsSystemProvides:     currentProject.mcsSystemProvides,
      mcsCylinderVolume:     currentProject.mcsCylinderVolume,
      mcsPasteurizationFreq: currentProject.mcsPasteurizationFreq,
      mcsUFHType:            currentProject.mcsUFHType,
      mcsBedrooms:           currentProject.mcsBedrooms,
      mcsOccupants:          currentProject.mcsOccupants,
      // Legacy ventilation fields — kept so old data survives
      useSAPVentilation:        currentProject.useSAPVentilation,
      buildingCategory:         currentProject.buildingCategory,
      dwellingType:             currentProject.dwellingType,
      numberOfStoreys:          currentProject.numberOfStoreys,
      shelterFactor:            currentProject.shelterFactor,
      numberOfBedrooms:         currentProject.numberOfBedrooms,
      hasBlowerTest:            currentProject.hasBlowerTest,
      sapAgeBand:               currentProject.sapAgeBand,
      airPermeabilityQ50:       currentProject.airPermeabilityQ50,
      numberOfChimneys:         currentProject.numberOfChimneys,
      numberOfOpenFlues:        currentProject.numberOfOpenFlues,
      numberOfIntermittentFans: currentProject.numberOfIntermittentFans,
      numberOfPassiveVents:     currentProject.numberOfPassiveVents,
      ventilationSystemType:    currentProject.ventilationSystemType,
      mvhrEfficiency:           currentProject.mvhrEfficiency,
      // EN 12831-1:2017 ventilation fields (migration 010)
      ventilationMethod:      currentProject.ventilationMethod,
      airPermeabilityMethod:  currentProject.airPermeabilityMethod,
      q50:                    currentProject.q50,
      sapStructural:          currentProject.sapStructural,
      sapFloor:               currentProject.sapFloor,
      sapWindowDraughtPct:    currentProject.sapWindowDraughtPct,
      sapDraughtLobby:        currentProject.sapDraughtLobby,
      buildingStoreys:        currentProject.buildingStoreys,
      buildingShielding:      currentProject.buildingShielding,
      referenceTemp:          currentProject.referenceTemp,
      mcsHeatPumpSoundPower:  currentProject.mcsHeatPumpSoundPower,
      mcsSoundAssessments:    currentProject.mcsSoundAssessments    || [],
      mcsSoundSnapshot:       currentProject.mcsSoundSnapshot       || null,
      mcsCalculationSnapshot: currentProject.mcsCalculationSnapshot || null,
      pipeSections:           currentProject.pipeSections           || [],
      circuits:               currentProject.circuits               || null,
      heatPumpManufacturer:   currentProject.heatPumpManufacturer,
      heatPumpModel:          currentProject.heatPumpModel,
      heatPumpRatedOutput:    currentProject.heatPumpRatedOutput,
      heatPumpMinModulation:  currentProject.heatPumpMinModulation  ?? 0,
      heatPumpFlowTemp:       currentProject.heatPumpFlowTemp,
      heatPumpReturnTemp:     currentProject.heatPumpReturnTemp,
      epcSpaceHeatingDemand:  currentProject.epcSpaceHeatingDemand,
      epcHotWaterDemand:      currentProject.epcHotWaterDemand,
      epcTotalFloorArea:      currentProject.epcTotalFloorArea,
      heatPumpInternalVolume: currentProject.heatPumpInternalVolume ?? 0,
      bufferVesselVolume:     currentProject.bufferVesselVolume     ?? 0,
      en14511TestPoints:      currentProject.en14511TestPoints      || [],
      defrostPct:             currentProject.defrostPct             ?? 5,
    });

    await loadProjects();
    alert('Project saved successfully!');
  } catch (error) {
    console.error('Error saving project:', error);
    alert('Error saving project');
  }
  setSaving(false);
};

const deleteProject = async (id) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      await api.deleteProject(id);
      await loadProjects();
      if (currentProject?.id === id) {
        setCurrentProject(null);
      }
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const updateProject = (field, value) => {
    setCurrentProject(prev => ({ ...prev, [field]: value }));
  };

  const updateProjectBatch = (updates) => {
    setCurrentProject(prev => ({ ...prev, ...updates }));
  };

  const handleUpdateClientAddress = async (addressId, data) => {
    await api.updateAddress(addressId, data);
    await loadProject(currentProject.id, true);
  };

  const applyMCSFromPostcode = async (projectId, postcode) => {
    if (!postcode) return;
    const mcs = getMCSDataFromPostcode(postcode);
    if (!mcs) return;
    await api.updateDesignParams(projectId, {
      ...currentProject,
      externalTemp:      mcs.lowTemp,
      mcsDegreeDays:     mcs.degreeDays,
      mcsOutdoorLowTemp: mcs.lowTemp,
    });
  };

  const handleSaveInstallAddress = async (installDraft) => {
    if (currentProject.installationAddressId) {
      // Address row already exists — update it in place
      await api.updateAddress(currentProject.installationAddressId, {
        addressLine1: installDraft.customerAddressLine1,
        addressLine2: installDraft.customerAddressLine2,
        town:         installDraft.customerTown,
        county:       installDraft.customerCounty,
        postcode:     installDraft.customerPostcode,
        what3words:   installDraft.customerWhat3words,
      });
    } else {
      // No address row yet (anonymous or newly created project) —
      // create one and link it to this project.
      await api.addProjectAddress(currentProject.id, {
        addressLine1: installDraft.customerAddressLine1,
        addressLine2: installDraft.customerAddressLine2,
        town:         installDraft.customerTown,
        county:       installDraft.customerCounty,
        postcode:     installDraft.customerPostcode,
        what3words:   installDraft.customerWhat3words,
        addressType:  'installation',
        isPrimary:    true,
      });
    }

    // Apply MCS design temperature from postcode if available
    const mcs = getMCSDataFromPostcode(installDraft.customerPostcode);
    if (mcs) {
      await api.updateDesignParams(currentProject.id, {
        ...currentProject,
        externalTemp:      mcs.lowTemp,
        mcsDegreeDays:     mcs.degreeDays,
        mcsOutdoorLowTemp: mcs.lowTemp,
      });
    }
    await loadProject(currentProject.id, true);
  };

  // U-Value Library handlers
  const addUValue = async () => {
    try {
      await api.createUValue({
        projectId: currentProject.id,
        elementCategory: 'External Wall',
        name: 'New Construction Type',
        uValue: 0,
        notes: ''
      });
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error adding U-value:', error);
    }
  };

  const addUValueFromCalculator = async ({ elementCategory, name, uValue, notes }) => {
  try {
    await api.createUValue({ projectId: currentProject.id, elementCategory, name, uValue, notes });
    await loadProject(currentProject.id, true);
  } catch (error) {
    console.error('Error adding U-value from calculator:', error);
  }
};

  const updateUValue = async (id, field, value) => {
    const uVal = currentProject.uValueLibrary.find(u => u.id === id);
    if (!uVal) return;
    try {
      // Build the updated record for both the API call and local state patch
      const updated = {
        elementCategory: field === 'elementCategory' ? value : uVal.element_category,
        name:    field === 'name'    ? value : uVal.name,
        uValue:  field === 'uValue'  ? value : uVal.u_value,
        notes:   field === 'notes'   ? value : uVal.notes,
      };
      await api.updateUValue(id, updated);
      // Patch local state directly — no loadProject, so the list never reorders
      // mid-edit. The category select was the main trigger: it fired onUpdate
      // immediately, loadProject re-sorted the list, disrupting the editing row.
      setCurrentProject(prev => ({
        ...prev,
        uValueLibrary: prev.uValueLibrary.map(u =>
          u.id !== id ? u : {
            ...u,
            element_category: updated.elementCategory,
            name:             updated.name,
            u_value:          updated.uValue,
            notes:            updated.notes,
          }
        ),
      }));
    } catch (error) {
      console.error('Error updating U-value:', error);
    }
  };

  const deleteUValue = async (id) => {
    try {
      await api.deleteUValue(id);
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error deleting U-value:', error);
    }
  };

  // Room handlers
  const addRoom = async () => {
    try {
      const result = await api.createRoom({
        projectId:         currentProject.id,
        name:              'New Room',
        internalTemp:      21,
        volume:            0,
        floorArea:         0,
        roomLength:        0,
        roomWidth:         0,
        roomHeight:        0,
        minAirFlow:        0,
        infiltrationRate:  0.5,
        mechanicalSupply:  0,
        mechanicalExtract: 0,
        // EN 12831-1 defaults — all zero so nothing is assumed
        exposedEnvelopeM2:    0,
        hasSuspendedFloor:    0,
        isTopStorey:          0,
        bgVentCount:          0,
        bgFanCount:           0,
        bgFlueSmallCount:     0,
        bgFlueLargeCount:     0,
        bgOpenFireCount:      0,
        continuousVentType:   'none',
        continuousVentRateM3h:0,
        mvhrEfficiency:       0,
      });
      await loadProject(currentProject.id, true);
      return result.id;
    } catch (error) {
      console.error('Error adding room:', error);
    }
  };

  const updateRoom = async (roomId, field, value) => {
    const room = currentProject.rooms.find(r => r.id === roomId);
    if (!room) return;

    let updates = { [field]: value };

    // Auto-calculate volume and floor area when dimensions change
    if (['roomLength', 'roomWidth', 'roomHeight'].includes(field)) {
      const newLength = field === 'roomLength' ? value : room.roomLength;
      const newWidth  = field === 'roomWidth'  ? value : room.roomWidth;
      const newHeight = field === 'roomHeight' ? value : room.roomHeight;
      if (newLength > 0 && newWidth > 0 && newHeight > 0) {
        updates.volume = calculateRoomVolume(newLength, newWidth, newHeight);
      }
      if (newLength > 0 && newWidth > 0) {
        updates.floorArea = calculateRoomFloorArea(newLength, newWidth);
      }
    }

    // Legacy ventilation field groups (kept for backward compat)
    const ventilationFields    = ['minAirFlow', 'infiltrationRate', 'mechanicalSupply', 'mechanicalExtract'];
    const sapVentilationFields = ['roomType', 'hasManualACHOverride', 'manualACH', 'extractFanFlowRate', 'hasOpenFire'];
    const isVentilationField    = ventilationFields.includes(field);
    const isSAPVentilationField = sapVentilationFields.includes(field);

    // EN 12831-1 room ventilation fields (migration 010)
    const en12831Fields = [
      'exposedEnvelopeM2', 'hasSuspendedFloor', 'isTopStorey',
      'bgVentCount', 'bgFanCount', 'bgFlueSmallCount', 'bgFlueLargeCount', 'bgOpenFireCount',
      'continuousVentType', 'continuousVentRateM3h', 'mvhrEfficiency',
    ];

    try {
      await api.updateRoom(roomId, {
        name:              updates.name              || room.name,
        internalTemp:      updates.internalTemp      || room.internalTemp,
        volume:            updates.volume            !== undefined ? updates.volume    : room.volume,
        floorArea:         updates.floorArea         !== undefined ? updates.floorArea : room.floorArea,
        roomLength:        updates.roomLength        !== undefined ? updates.roomLength  : room.roomLength,
        roomWidth:         updates.roomWidth         !== undefined ? updates.roomWidth   : room.roomWidth,
        roomHeight:        updates.roomHeight        !== undefined ? updates.roomHeight  : room.roomHeight,
        // Legacy ventilation
        minAirFlow:        isVentilationField && field === 'minAirFlow'        ? value : room.ventilation.minAirFlow,
        infiltrationRate:  isVentilationField && field === 'infiltrationRate'  ? value : room.ventilation.infiltrationRate,
        mechanicalSupply:  isVentilationField && field === 'mechanicalSupply'  ? value : room.ventilation.mechanicalSupply,
        mechanicalExtract: isVentilationField && field === 'mechanicalExtract' ? value : room.ventilation.mechanicalExtract,
        // SAP ventilation fields (legacy)
        roomType:             isSAPVentilationField && field === 'roomType'             ? value : (room.roomType             || 'living_room'),
        hasManualACHOverride: isSAPVentilationField && field === 'hasManualACHOverride' ? value : (room.hasManualACHOverride || false),
        manualACH:            isSAPVentilationField && field === 'manualACH'            ? value : (room.manualACH            || 0),
        extractFanFlowRate:   isSAPVentilationField && field === 'extractFanFlowRate'   ? value : (room.extractFanFlowRate   || 0),
        hasOpenFire:          isSAPVentilationField && field === 'hasOpenFire'          ? value : (room.hasOpenFire          || false),
        designConnectionType: updates.designConnectionType !== undefined
          ? updates.designConnectionType
          : (room.designConnectionType || 'BOE'),

        // Thermal bridging addition (CIBSE DHDG 2026 Table 2-9, migration 011)
        thermalBridgingAddition: updates.thermalBridgingAddition !== undefined
          ? updates.thermalBridgingAddition
          : (room.thermalBridgingAddition ?? 0.10),

        // EN 12831-1 ventilation fields (migration 010)
        exposedEnvelopeM2:    en12831Fields.includes(field) && field === 'exposedEnvelopeM2'    ? value : (room.exposedEnvelopeM2    ?? 0),
        hasSuspendedFloor:    en12831Fields.includes(field) && field === 'hasSuspendedFloor'    ? value : (room.hasSuspendedFloor    ?? 0),
        isTopStorey:          en12831Fields.includes(field) && field === 'isTopStorey'          ? value : (room.isTopStorey           ?? 0),
        bgVentCount:          en12831Fields.includes(field) && field === 'bgVentCount'          ? value : (room.bgVentCount          ?? 0),
        bgFanCount:           en12831Fields.includes(field) && field === 'bgFanCount'           ? value : (room.bgFanCount           ?? 0),
        bgFlueSmallCount:     en12831Fields.includes(field) && field === 'bgFlueSmallCount'     ? value : (room.bgFlueSmallCount     ?? 0),
        bgFlueLargeCount:     en12831Fields.includes(field) && field === 'bgFlueLargeCount'     ? value : (room.bgFlueLargeCount     ?? 0),
        bgOpenFireCount:      en12831Fields.includes(field) && field === 'bgOpenFireCount'      ? value : (room.bgOpenFireCount      ?? 0),
        continuousVentType:   en12831Fields.includes(field) && field === 'continuousVentType'   ? value : (room.continuousVentType   || 'none'),
        continuousVentRateM3h:en12831Fields.includes(field) && field === 'continuousVentRateM3h'? value : (room.continuousVentRateM3h ?? 0),
        mvhrEfficiency:       en12831Fields.includes(field) && field === 'mvhrEfficiency'       ? value : (room.mvhrEfficiency       ?? 0),
      });
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error updating room:', error);
    }
  };

  const deleteRoom = async (roomId) => {
    try {
      await api.deleteRoom(roomId);
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error deleting room:', error);
    }
  };

  // Element handlers
  const addElement = async (roomId) => {
    const room = currentProject.rooms.find(r => r.id === roomId);
    const defaultDeltaT = room ? room.internalTemp - currentProject.externalTemp : null;
    // Default include_in_envelope based on element type — External Wall, Suspended Floor
    // and Roof are almost always exposed; everything else defaults to off.
    const DEFAULT_ENVELOPE_TYPES = ['External Wall', 'Ground Floor (Suspended)', 'Roof'];
    try {
      await api.createElement({
        roomId, elementType: 'External Wall', description: '',
        length: 0, height: 0, area: 0, uValue: 0, tempFactor: 1.0,
        customDeltaT: null, subtractFromElementId: null,
        includeInEnvelope: 1, // External Wall is the default type, always include
      });
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error adding element:', error);
    }
  };

  const updateElement = async (roomId, elementId, field, value) => {
  const room    = currentProject.rooms.find(r => r.id === roomId);
  const element = room?.elements.find(e => e.id === elementId);
  if (!element) return;
  let updates = { [field]: value };

  // Auto-calculate area when dimensions change
  if (field === 'length' || field === 'height') {
    const newLength = field === 'length' ? value : element.length;
    const newHeight = field === 'height' ? value : element.height;
    if (newLength > 0 && newHeight > 0) updates.area = calculateElementArea(newLength, newHeight);
  }

  // When element type changes, update includeInEnvelope default and customDeltaT
  if (field === 'elementType') {
    const DEFAULT_ENVELOPE_TYPES = ['External Wall', 'Ground Floor (Suspended)', 'Roof'];
    updates.includeInEnvelope = DEFAULT_ENVELOPE_TYPES.includes(value) ? 1 : 0;

    const refTemp = currentProject.referenceTemp ?? 10.6;
    if (value === 'Ground Floor (Slab)') {
      updates.customDeltaT = room.internalTemp - refTemp;
    } else if (value === 'Ground Floor (Suspended)') {
      updates.customDeltaT = null;
    } else if (element.elementType === 'Ground Floor (Slab)') {
      updates.customDeltaT = null;
    }
  }

  try {
    await api.updateElement(elementId, {
      elementType:           updates.elementType           || element.elementType,
      description:           updates.description           !== undefined ? updates.description  : element.description,
      length:                updates.length                !== undefined ? updates.length        : element.length,
      height:                updates.height                !== undefined ? updates.height        : element.height,
      area:                  updates.area                  !== undefined ? updates.area          : element.area,
      uValue:                updates.uValue                !== undefined ? updates.uValue        : element.uValue,
      tempFactor:            updates.tempFactor            !== undefined ? updates.tempFactor    : element.tempFactor,
      customDeltaT:          updates.customDeltaT          !== undefined ? updates.customDeltaT  : element.customDeltaT,
      subtractFromElementId: updates.subtractFromElementId !== undefined ? updates.subtractFromElementId : element.subtractFromElementId,
      includeInEnvelope:     updates.includeInEnvelope     !== undefined ? updates.includeInEnvelope : (element.includeInEnvelope ?? 0),
    });

    // After saving the element, recompute exposedEnvelopeM2 for the room
    // as the sum of areas of all elements with includeInEnvelope = 1.
    // Use updateRoom (the App-level handler) so all field defaults are applied
    // correctly and we don't have to duplicate the full room payload here.
    if (field === 'includeInEnvelope' || field === 'area' || field === 'length' || field === 'height') {
      const updatedElements = room.elements.map(el =>
        el.id === elementId
          ? { ...el, ...updates, area: updates.area ?? el.area }
          : el
      );
      const newEnvelope = updatedElements.reduce((sum, el) => {
        if (!(el.includeInEnvelope ?? 0)) return sum;
        // Use effective area: subtract any child elements
        const subtracted = updatedElements
          .filter(s => s.subtractFromElementId === el.id)
          .reduce((s, sub) => s + (sub.area ?? 0), 0);
        return sum + Math.max(0, (el.area ?? 0) - subtracted);
      }, 0);
      // updateRoom calls loadProject internally — return early to avoid double reload
      await updateRoom(room.id, 'exposedEnvelopeM2', parseFloat(newEnvelope.toFixed(2)));
      return;
    }

    await loadProject(currentProject.id, true);
  } catch (error) {
    console.error('Error updating element:', error);
  }
};

  const updateElementBatch = async (roomId, elementId, fields) => {
    const room    = currentProject.rooms.find(r => r.id === roomId);
    const element = room?.elements.find(e => e.id === elementId);
    if (!element) return;
    try {
      await api.updateElement(elementId, {
        elementType:           fields.elementType           ?? element.elementType,
        description:           fields.description           ?? element.description,
        length:                fields.length                ?? element.length,
        height:                fields.height                ?? element.height,
        area:                  fields.area                  ?? element.area,
        uValue:                fields.uValue                ?? element.uValue,
        tempFactor:            fields.tempFactor            ?? element.tempFactor,
        customDeltaT:          fields.customDeltaT          ?? element.customDeltaT,
        subtractFromElementId: fields.subtractFromElementId ?? element.subtractFromElementId,
        includeInEnvelope:     fields.includeInEnvelope     ?? (element.includeInEnvelope ?? 0),
      });
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error batch-updating element:', error);
    }
  };

  const deleteElement = async (elementId) => {
    try {
      await api.deleteElement(elementId);
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error deleting element:', error);
    }
  };

  // Emitter handlers
  const addEmitter = async (roomId) => {
    try {
      await api.createRoomEmitter({ roomId, emitterType: 'None', radiatorSpecId: null, connectionType: 'TBOE', quantity: 1, notes: '' });
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error adding emitter:', error);
    }
  };

  const updateEmitter = async (roomId, emitterId, field, value) => {
    const room    = currentProject.rooms.find(r => r.id === roomId);
    const emitter = room?.emitters?.find(e => e.id === emitterId);
    if (!emitter) return;
    try {
      await api.updateRoomEmitter(emitterId, {
        emitterType:    field === 'emitterType'    ? value : emitter.emitterType,
        radiatorSpecId: field === 'radiatorSpecId' ? value : emitter.radiatorSpecId,
        connectionType: field === 'connectionType' ? value : emitter.connectionType,
        quantity:       field === 'quantity'       ? value : emitter.quantity,
        notes:          field === 'notes'          ? value : emitter.notes || ''
      });
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error updating emitter:', error);
    }
  };

  const updateUFHSpecs = async (roomId, data) => {
    try {
      await api.updateUFHSpecs(roomId, data);
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error updating UFH specs:', error);
    }
  };

  const deleteEmitter = async (emitterId) => {
    try {
      let ufhRoomId = null;
      for (const room of currentProject.rooms) {
        const emitter = room.emitters?.find(e => e.id === emitterId);
        if (emitter && emitter.emitterType === 'UFH' && room.ufhSpecs) {
          ufhRoomId = room.id;
          break;
        }
      }
      if (ufhRoomId) {
        const confirmed = window.confirm(
          'This room has a saved UFH specification (floor construction, pipe spacing, ' +
          'floor covering and calculated output).\n\n' +
          'Do you want to delete the UFH specification as well?\n\n' +
          'OK = delete emitter and specification\n' +
          'Cancel = keep both'
        );
        if (!confirmed) return;
        await api.deleteRoomEmitter(emitterId);
        await api.deleteUFHSpecs(ufhRoomId);
      } else {
        await api.deleteRoomEmitter(emitterId);
      }
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error deleting emitter:', error);
    }
  };

  // Change addRadiatorSpec to return the new id:
  const addRadiatorSpec = async (radiatorData) => {
    try {
      const result = await api.createRadiatorSpec(radiatorData);
      await loadProject(currentProject.id, true);
      return result.id;  // ← return the new id to the caller
    } catch (error) {
      console.error('Error adding radiator spec:', error);
      return null;
    }
  };

  const addUFHEmitter = async (roomId) => {
    try {
      await api.createRoomEmitter({ roomId, emitterType: 'UFH', radiatorSpecId: null, connectionType: null, quantity: 1, notes: '' });
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error adding UFH emitter:', error);
    }
  };

  const removeUFHSpecs = async (roomId) => {
    try {
      // Remove the UFH emitter entry and the UFH spec row for this room
      const room = currentProject.rooms.find(r => r.id === roomId);
      const ufhEmitter = room?.emitters?.find(e => e.emitterType === 'UFH');
      if (ufhEmitter) await api.deleteRoomEmitter(ufhEmitter.id);
      await api.deleteUFHSpecs(roomId);
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error removing UFH specs:', error);
    }
  };

  // Persists pipeSections immediately so loadProject calls from other tabs
  // don't reset sections the user has just added or edited.
  const savePipeSections = async (pipeSections) => {
    try {
      await api.updateDesignParams(currentProject.id, {
        ...currentProject,
        pipeSections,
      });
    } catch (error) {
      console.error('Error saving pipe sections:', error);
    }
  };

  // Generic handler to persist any design_params fields immediately.
  // Called from MCS/pipe-sizing components on blur or action, so that
  // loadProject triggered by other tabs never resets unsaved values.
  // Pass a partial object — it is merged with currentProject before saving.
  const saveDesignParams = async (fields) => {
    try {
      await api.updateDesignParams(currentProject.id, {
        ...currentProject,
        ...fields,
      });
    } catch (error) {
      console.error('Error saving design params:', error);
    }
  };

  // Radiator Schedule handlers
  const updateRadiatorSchedule = async (roomId, action, data) => {
    try {
      if (action === 'connectionType') {
          const room = currentProject.rooms.find(r => r.id === roomId);
          if (!room) return;
          await api.updateRoom(roomId, {
            name:              room.name,
            internalTemp:      room.internalTemp,
            volume:            room.volume,
            floorArea:         room.floorArea,
            roomLength:        room.roomLength,
            roomWidth:         room.roomWidth,
            roomHeight:        room.roomHeight,
            roomType:          room.roomType          || 'living_room',
            hasManualACHOverride: room.hasManualACHOverride || false,
            manualACH:         room.manualACH          || 0,
            extractFanFlowRate:room.extractFanFlowRate  || 0,
            hasOpenFire:       room.hasOpenFire         || false,
            minAirFlow:        room.ventilation?.minAirFlow        || 0,
            infiltrationRate:  room.ventilation?.infiltrationRate  || 0.5,
            mechanicalSupply:  room.ventilation?.mechanicalSupply  || 0,
            mechanicalExtract: room.ventilation?.mechanicalExtract || 0,
            designConnectionType: data.value,
            // EN 12831-1 fields preserved as-is
            exposedEnvelopeM2:    room.exposedEnvelopeM2    ?? 0,
            hasSuspendedFloor:    room.hasSuspendedFloor    ?? 0,
            isTopStorey:          room.isTopStorey           ?? 0,
            bgVentCount:          room.bgVentCount           ?? 0,
            bgFanCount:           room.bgFanCount            ?? 0,
            bgFlueSmallCount:     room.bgFlueSmallCount      ?? 0,
            bgFlueLargeCount:     room.bgFlueLargeCount      ?? 0,
            bgOpenFireCount:      room.bgOpenFireCount       ?? 0,
            continuousVentType:   room.continuousVentType    || 'none',
            continuousVentRateM3h:room.continuousVentRateM3h ?? 0,
            mvhrEfficiency:       room.mvhrEfficiency        ?? 0,
          });
          await loadProject(currentProject.id, true);

        } else if (action === 'add') {
        await api.createRadiatorSchedule({
          roomId, radiatorSpecId: data.radiatorSpecId,
          connectionType: data.connectionType || 'BOE',
          quantity:       data.quantity       || 1,
          isExisting:     data.isExisting     || false,
          emitterStatus:  data.emitterStatus  || 'new',
          notes:          data.notes          || '',
          displayOrder:   0,
        });
      } else if (action === 'update') {
        const room      = currentProject.rooms.find(r => r.id === roomId);
        const schedItem = room?.radiatorSchedule?.find(s => s.id === data.id);
        if (!schedItem) return;
        await api.updateRadiatorSchedule(data.id, {
          radiatorSpecId:  data.field === 'radiatorSpecId'  ? data.value : schedItem.radiator_spec_id,
          connectionType:  data.field === 'connectionType'  ? data.value : schedItem.connection_type,
          quantity:        data.field === 'quantity'         ? data.value : schedItem.quantity,
          isExisting:      data.field === 'isExisting'       ? data.value : schedItem.is_existing,
          emitterStatus:   data.field === 'emitterStatus'    ? data.value : (schedItem.emitter_status   || 'new'),
          notes:           data.field === 'notes'            ? data.value : schedItem.notes,
          enclosureFactor: data.field === 'enclosureFactor'  ? data.value : (schedItem.enclosure_factor ?? 1.00),
          finishFactor:    data.field === 'finishFactor'     ? data.value : (schedItem.finish_factor    ?? 1.00),
          noTrv:           data.field === 'noTrv'            ? data.value : (schedItem.no_trv           ?? 0),
          displayOrder:    schedItem.display_order,
        });
      } else if (action === 'delete') {
        await api.deleteRadiatorSchedule(data.id);
      }
      await loadProject(currentProject.id, true);
    } catch (error) {
      console.error('Error updating radiator schedule:', error);
    }
  };

  const handleDeleteProject = async (id) => {
    try {
      await api.deleteProject(id);
      await loadProjects();
      if (currentProject?.id === id) setCurrentProject(null);
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  if (showSettings) {
    return (
      <SettingsPage onBack={() => setShowSettings(false)} onDeleteProject={handleDeleteProject} />
    );
  }

  // Project selection screen
  if (!currentProject && canSeeDashboard) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <HomeIcon />
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">
                    {currentCompany?.name || 'OpenHeatLoss'}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {[
                      currentCompany?.name,
                      currentCompany?.mcs_number ? `MCS: ${currentCompany.mcs_number}` : null,
                    ].filter(Boolean).join(' · ') || 'Heat loss calculation & system design'}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-center">
                <button
                  onClick={() => setShowSettings(true)}
                  className="bg-gray-700 text-white py-2 px-4 rounded-lg hover:bg-gray-800 text-sm font-semibold transition"
                >
                  ⚙ Settings
                </button>
                <button
                  onClick={() => setShowNewProjectModal(true)}
                  className="bg-blue-600 text-white py-2 px-5 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-semibold transition"
                >
                  <PlusIcon />
                  New Project
                </button>
              </div>
            </div>

            {showNewProjectModal && (
              <NewProjectModal
                onCreated={(id) => {
                  setShowNewProjectModal(false);
                  loadProject(id);
                }}
              />
            )}

            {!showNewProjectModal && (
              <ProjectDashboard
                onOpen={(id) => loadProject(id)}
                onStatusChange={() => loadProjects()}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Free registered user with no project loaded, OR still loading (anonymous boot)
  if (!currentProject) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-gray-800 mb-2">OpenHeatLoss</h2>
          <p className="text-gray-500 mb-6">Loading your project...</p>
          <button
            onClick={async () => {
              const res = await fetch('/api/projects');
              const userProjects = await res.json();
              if (userProjects.length > 0) loadProject(userProjects[0].id);
            }}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition"
          >
            Open Project
          </button>
          <button
            onClick={handleLogout}
            className="block mx-auto mt-3 text-sm text-gray-400 hover:text-gray-600"
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  // Project editing screen
  return (
    <div className="min-h-screen bg-gray-50">

      {/* About modal */}
      {showAbout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowAbout(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-screen overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">About OpenHeatLoss</h2>
                <p className="text-blue-200 text-sm mt-0.5">openheatloss.com</p>
              </div>
              <button onClick={() => setShowAbout(false)} className="text-blue-200 hover:text-white text-2xl leading-none ml-4">×</button>
            </div>

            <div className="px-6 py-5 space-y-5 text-gray-700 text-sm leading-relaxed">

              <div>
                <h3 className="font-bold text-gray-900 mb-1">Why this tool exists</h3>
                <p>
                  OpenHeatLoss started with a self-build. When I built my own house I needed a heating system
                  design and couldn't find a local engineer to take on the job to design a low temperature heating system. So I designed and
                  installed the heating system myself. At the time there was no accessible software for someone in my position,
                  so I bought a copy of the CIBSE Domestic Heating Design Guide and built a design tool in
                  a spreadsheet.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-1">From self-builder to heating engineer</h3>
                <p>
                  That experience led me into the trade. I started <a href="mysaheating.uk">Mysa Heating</a> 
                  and kept using the spreadsheet for system designs through the business. As we moved to focus
                  on heat pumps and became MCS certified, the spreadsheet still worked — but it was slow, 
                  cumbersome, and not built for managing multiple projects. When MCS introduced the requirement
                  for designs to comply with BS EN 12831:2017, I knew it was time to build something more robust 
                  and comprehensive, and which helped me comply more easily with MCS design requirements.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-1">Why not use existing tools?</h3>
                <p>
                  I tried six different heat loss tools on the market. Several were drawing-based — you had
                  to draw the property, which created its own limitations and workarounds for anything that
                  wasn't a simple box. More importantly, I got different results between tools for the same
                  property and couldn't dig into the assumptions to understand why. That lack of transparency, 
                  high subscription costs, my project data locked into a platform which could be difficult if 
                  not impossible to extract if I moved on, were key deciding factors.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-1">Open source and auditable by design</h3>
                <p>
                  OpenHeatLoss is open source (AGPL v3). Every calculation is visible, every assumption is
                  documented, and anyone can verify what the tool is doing and why. That's deliberate. The
                  calculation method follows CIBSE Domestic Heating Design Guide 2026 rather than the raw
                  BS EN 12831:2017 standard — partly because the CIBSE guide is the accepted UK
                  implementation, and partly because verifying it only requires a copy of the CIBSE guide
                  rather than paying several hundred pounds for the EN standard itself. Accessibility matters.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-1">Early access</h3>
                <p>
                  In building this tool, I've tried to make the workflow follow the logical steps a heating system 
                  designer naturally needs to follow to produce a good design. This is an early release. The core calculations — heat loss per EN 12831-1, emitter sizing,
                  pipe sizing, MCS MIS 3005-D documentation — are implemented and validated against real
                  projects. There is more to build. If you find something that doesn't look right, or a
                  workflow that doesn't fit how you work, please say so.
                </p>
                <p className="mt-2">
                  <a href="mailto:heatloss@openheatloss.com" className="text-blue-600 hover:text-blue-800 underline font-medium">
                    heatloss@openheatloss.com
                  </a>
                  <span className="text-gray-400 mx-2">·</span>
                  <a href="https://mysaheating.uk" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                    mysaheating.uk
                  </a>
                </p>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Anonymous session banner */}
      {isAnonymous && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <p className="text-amber-800 text-sm">
              <span className="font-semibold">You're working anonymously.</span>{' '}
              Your project will be lost if you close this browser tab.
              Register free to save your work and come back to it.
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => { setAuthError(''); setShowAuthModal('login'); }}
                className="bg-white border border-amber-400 text-amber-700 text-sm font-semibold px-4 py-1.5 rounded transition hover:bg-amber-50"
              >
                Log in
              </button>
              <button
                onClick={() => { setAuthError(''); setShowAuthModal('register'); }}
                className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-1.5 rounded transition"
              >
                Register free
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-blue-600 text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{currentProject.name}</h1>
            <p className="text-blue-100">
              {[currentProject.customerAddressLine1, currentProject.customerTown, currentProject.customerPostcode]
                .filter(Boolean)
                .join(', ') || 'No address set'}
            </p>
          </div>

          {/* Feedback — centre of header */}
          <div className="text-center text-sm text-blue-100 hidden md:block">
            <p className="font-semibold text-white mb-0.5">🧪 Early access — your feedback shapes this tool</p>
            <p>
              Found a bug or have a suggestion?{' '}
              <a href="mailto:heatloss@openheatloss.com" className="underline hover:text-white transition">
                heatloss@openheatloss.com
              </a>
              {' · '}
              <button onClick={() => setShowAbout(true)} className="underline hover:text-white transition">
                About this tool
              </button>
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                const addr = [currentProject.customerAddressLine1, currentProject.customerTown]
                             .filter(Boolean).join(', ');
                const params = new URLSearchParams({
                  projectId: currentProject.id,
                  client:    [currentProject.customerFirstName, currentProject.customerSurname].filter(Boolean).join(' '),
                  address:   addr,
                  postcode:  currentProject.customerPostcode || '',
                });
                window.open(`/survey.html?${params.toString()}`, '_blank');
              }}
              className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded transition text-sm"
            >
              Survey
            </button>
            <button
              onClick={isAnonymous
                ? () => { setAuthError(''); setShowAuthModal('register'); }
                : saveProject}
              disabled={saving}
              className={`px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50 transition ${
                isAnonymous
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <SaveIcon />
              {isAnonymous ? 'Register to Save' : (saving ? 'Saving...' : 'Save')}
            </button>
            {currentUser && (
              <button
                onClick={handleLogout}
                className="bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded transition text-sm"
              >
                Log out
              </button>
            )}
            {canSeeDashboard && (
              <button
                onClick={() => setCurrentProject(null)}
                className="bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded transition"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg mb-6">
          {/* Navigation Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex">
              {[
                { key: 'project',    label: 'Project Info' },
                { key: 'mcs031',     label: 'MCS031' },
                { key: 'mcs020',     label: 'MCS020' },
                { key: 'u-values',   label: 'U-Value Library' },
                { key: 'rooms',      label: `Rooms (${currentProject.rooms?.length || 0})` },
                { key: 'summary',    label: 'Heat Loss Summary' },
                { key: 'radiators',  label: 'Emitter Sizing' },
                { key: 'pipe-sizing',label: 'Pipe Sizing' },
                { key: 'quote',      label: 'Quote' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-6 py-3 font-semibold ${
                    activeTab === key
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  } transition`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'project' && (
              <ProjectInfo
                project={currentProject}
                onUpdate={updateProject}
                onUpdateBatch={updateProjectBatch}
                onUpdateClientAddress={handleUpdateClientAddress}
                onSaveInstallAddress={handleSaveInstallAddress}
              />
            )}
            {activeTab === 'mcs031' && (
              <MCS031PerformanceEstimator project={currentProject} onUpdate={updateProject} onSave={saveDesignParams} />
            )}
            {activeTab === 'mcs020' && (
              <MCS020SoundCalculator project={currentProject} onUpdate={updateProject} onSave={saveDesignParams} />
            )}
            {activeTab === 'u-values' && (
              <UValueLibrary
                project={currentProject}
                onAdd={addUValue}
                onAddFromCalculator={addUValueFromCalculator}
                onUpdate={updateUValue}
                onDelete={deleteUValue}
              />
            )}
            {activeTab === 'rooms' && (
              <RoomList
                rooms={currentProject.rooms}
                project={currentProject}
                onAddRoom={addRoom}
                onUpdateRoom={updateRoom}
                onDeleteRoom={deleteRoom}
                onAddElement={addElement}
                onUpdateElement={updateElement}
                onUpdateElementBatch={updateElementBatch}
                onDeleteElement={deleteElement}
                onAddEmitter={addEmitter}
                onUpdateEmitter={updateEmitter}
                onDeleteEmitter={deleteEmitter}
                onAddRadiatorSpec={addRadiatorSpec}
              />
            )}
            {activeTab === 'summary' && (
              <Summary
                project={currentProject}
                onUpdateProject={updateProject}
                onUpdateBatch={updateProjectBatch}
              />
            )}
            {activeTab === 'radiators' && (
              <RadiatorSizing
                project={currentProject}
                onUpdateProject={updateProject}
                onAddRadiatorSpec={addRadiatorSpec}
                onUpdateRadiatorSchedule={updateRadiatorSchedule}
                onUpdateUFHSpecs={updateUFHSpecs}
                onAddUFHEmitter={addUFHEmitter}
                onRemoveUFH={removeUFHSpecs}
              />
            )}
            {activeTab === 'pipe-sizing' && (
              <PipeSizing project={currentProject} onUpdate={updateProject} onSavePipeSections={savePipeSections} onSave={saveDesignParams} />
            )}
            {activeTab === 'quote' && (
              <QuoteBuilder project={currentProject} />
            )}
          </div>
        </div>

        {/* Bottom Save & Close Bar */}
        <div className="bg-white rounded-lg shadow-lg p-4 mt-6 sticky bottom-4">
          <div className="flex justify-center gap-3">
            <button
              onClick={isAnonymous
                ? () => { setAuthError(''); setShowAuthModal('register'); }
                : saveProject}
              disabled={saving}
              className={`px-6 py-3 rounded-lg flex items-center gap-2 disabled:opacity-50 transition font-semibold shadow-md text-white ${
                isAnonymous
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <SaveIcon />
              {isAnonymous ? 'Register free to Save' : (saving ? 'Saving...' : 'Save Project')}
            </button>
            {canSeeDashboard && (
              <button
                onClick={() => setCurrentProject(null)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition font-semibold shadow-md"
              >
                Close Project
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Auth modal — rendered here so it overlays the project screen */}
      {showAuthModal && (
        <AuthModal
          mode={showAuthModal}
          error={authError}
          loading={authLoading}
          onRegister={handleRegister}
          onLogin={handleLogin}
          onSwitchMode={(m) => { setAuthError(''); setShowAuthModal(m); }}
          onClose={() => setShowAuthModal(null)}
        />
      )}
    </div>
  );
}

// =============================================================================
// AUTH MODAL
// Handles both register and login in a single component, toggled by `mode`.
// Kept in App.jsx to avoid an extra file — it's small and tightly coupled
// to the auth state that lives here.
// =============================================================================
function AuthModal({ mode, error, loading, onRegister, onLogin, onSwitchMode, onClose }) {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [localError, setLocalError] = useState('');

  const isRegister = mode === 'register';

  const handleSubmit = () => {
    setLocalError('');
    if (isRegister) {
      if (!name.trim()) { setLocalError('Please enter your name'); return; }
      if (!email.trim()) { setLocalError('Please enter your email'); return; }
      if (password.length < 8) { setLocalError('Password must be at least 8 characters'); return; }
      if (password !== confirm) { setLocalError('Passwords do not match'); return; }
      onRegister({ name: name.trim(), email: email.trim(), password });
    } else {
      if (!email.trim()) { setLocalError('Please enter your email'); return; }
      if (!password) { setLocalError('Please enter your password'); return; }
      onLogin({ email: email.trim(), password });
    }
  };

  const displayError = localError || error;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {isRegister ? 'Create your free account' : 'Log in to your account'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {isRegister
                ? 'Your project will be saved to your account.'
                : 'Welcome back — your project will load automatically.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {isRegister && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Your name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus={!isRegister}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isRegister ? 'At least 8 characters' : ''}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={e => e.key === 'Enter' && !isRegister && handleSubmit()}
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>
          )}

          {displayError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {displayError}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
          >
            {loading
              ? (isRegister ? 'Creating account…' : 'Logging in…')
              : (isRegister ? 'Create account & save project' : 'Log in')}
          </button>
        </div>

        {/* Footer — switch mode */}
        <div className="px-6 pb-6 text-center text-sm text-gray-500">
          {isRegister ? (
            <>Already have an account?{' '}
              <button
                onClick={() => onSwitchMode('login')}
                className="text-blue-600 hover:underline font-semibold"
              >
                Log in
              </button>
            </>
          ) : (
            <>Don't have an account?{' '}
              <button
                onClick={() => onSwitchMode('register')}
                className="text-blue-600 hover:underline font-semibold"
              >
                Register free
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
