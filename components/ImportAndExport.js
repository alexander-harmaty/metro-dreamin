import React, { useContext, useState, useEffect } from 'react';
import { FirebaseContext } from '/util/firebase.js';
import { getFullSystem } from '/util/firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import { Prompt } from '/components/Prompt.js';
import { renderFadeWrap } from '/util/helpers';
import { Modal } from '/components/Modal.js';
import { LINE_MODES, DEFAULT_LINE_MODE } from '/util/constants.js';

export function ImportAndExport({ systemId, isNew, isSaved, handleSave, onSetToast, viewOnly }) {
  const firebaseContext = useContext(FirebaseContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prompt, setPrompt] = useState();
  const [fileName, setFileName] = useState('');
  const [defaultFileName, setDefaultFileName] = useState('');
  const [fileType, setFileType] = useState('json');
  const [importFile, setImportFile] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [modalState, setModalState] = useState('ImportAndExport');
  const [fadeClass, setFadeClass] = useState('fade-in');

  useEffect(() => {
    async function fetchSystemData() {
      const systemDoc = await getDoc(doc(firebaseContext.database, `systems/${systemId}`));
      const systemTitle = systemDoc.data().title || 'Untitled_Map';
      const creatorDoc = await getDoc(doc(firebaseContext.database, `users/${systemDoc.data().userId}`));
      const creatorName = creatorDoc.data().displayName || 'Unknown_Creator';
      const defaultName = `MetroDreamin Map '${systemTitle}' by ${creatorName}`;
      setFileName(defaultName);
      setDefaultFileName(defaultName);
    }
    fetchSystemData();
  }, [systemId, firebaseContext.database]);

  const handleFileUpload = (event) => {
    const files = event.target.files;
    const updatedFiles = [...uploadedFiles];
  
    for (let file of files) {
      updatedFiles.push({
        name: file.name,
        id: Math.random().toString(36).substr(2, 9)  // Generate a unique ID for each file
      });
    }
  
    setUploadedFiles(updatedFiles);
  };  

  const handleFileRemove = (fileId) => {
    setUploadedFiles(uploadedFiles.filter(file => file.id !== fileId));
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    const updatedFiles = [...uploadedFiles];

    for (let file of files) {
      if (file.type === "application/json") {
        updatedFiles.push({
          name: file.name,
          id: Math.random().toString(36).substr(2, 9)
        });
      }
    }

    setUploadedFiles(updatedFiles);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const switchModalContent = (newState) => {
    setFadeClass('fade-out');
    setTimeout(() => {
      setModalState(newState);
      setFadeClass('fade-in');
    }, 300); // Keep the timeout duration aligned with the fade transition duration
  };  

  const handleImportButton = () => {
    // Parse the file contents into objects

    // Trigger the modal state change to "Select lines from file"
    switchModalContent('SelectLines');
  };

  const handleBackButton = () => {
    switchModalContent('ImportAndExport');
  };

  const renderUploadedFiles = () => {
    return uploadedFiles.map(file => (
      <div key={file.id} className="ImportAndExport-fileItem">
        <div className="ImportAndExport-fileIcon">
          <i className="fas fa-file-alt"></i>
        </div>
        <div className="ImportAndExport-fileDetails">
          <div className="ImportAndExport-fileName">
            {file.name}
          </div>
        </div>
        <div className="ImportAndExport-fileStatus">
          <button onClick={() => handleFileRemove(file.id)}>Delete</button>
        </div>
      </div>
    ));
  };

  const renderLineSelection = () => {
    return (
      <div className="ImportAndExport-content">
        <div className="ImportAndExport-lineSelection">
          {/* Replace this with actual line and lineGroup rendering based on the uploaded files */}
          <p>Line 1</p>
          <p>Line 2</p>
          {/* Dummy buttons for now */}
        </div>
        <div className="ImportAndExport-buttonWrap">
          <button className="Button--primary" onClick={handleBackButton}>Back</button>
          <button className="Button--primary" style={{ marginLeft: 'auto' }}>Add selection</button>
        </div>
      </div>
    );
  };

  const exportSystem = async (formatFn, fileType, fileExtension, mimeType) => {
    try {
      const fullSystem = await getFullSystem(systemId);
      const formattedData = formatFn(fullSystem);

      const blob = new Blob([formattedData], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName.trim() || defaultFileName}.${fileExtension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onSetToast('Export successful!');
    } catch (error) {
      console.error(`Error exporting system: ${error}`);
      onSetToast('Export failed.');
    }
  };

  const handleExport = async () => {
    const formatFn = fileType === 'json' ? serializeToJSON : serializeToKML;
    const fileExtension = fileType === 'json' ? 'json' : 'kml';
    const mimeType = fileType === 'json' ? 'application/json' : 'application/vnd.google-earth.kml+xml';

    setIsModalOpen(false);
    if (!isNew && !isSaved) {
      setPrompt({
        message: "You have unsaved changes. Do you want to save before exporting?",
        confirmText: "Yes, save and export.",
        denyText: "No, export without my changes.",
        confirmFunc: () => {
          setPrompt(null);
          handleSave(() => exportSystem(formatFn, fileType, fileExtension, mimeType));
        },
        denyFunc: async () => {
          setPrompt(null);
          await exportSystem(formatFn, fileType, fileExtension, mimeType);
        },
      });
    } else {
      await exportSystem(formatFn, fileType, fileExtension, mimeType);
    }
  };

  const handleFileTypeChange = (type) => {
    setFileType(type);
  };

  const renderModalContent = () => {
    if (modalState === 'ImportAndExport') {
      return (
        <div className={`ImportAndExport-content ${fadeClass}`}>
          {firebaseContext.user && !isNew && (
            <div className="ImportAndExport-importSection">
              <div 
                className="ImportAndExport-uploadArea"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <input
                  type="file"
                  accept=".json"
                  multiple
                  onChange={handleFileUpload}
                  className="ImportAndExport-fileInput"
                />
                <div className="ImportAndExport-dragBox">
                  <div>Drag and drop files here</div>
                  <div>- OR -</div>
                  <button onClick={() => document.querySelector('.ImportAndExport-fileInput').click()}>Browse Files</button>
                </div>
              </div>
              <div className={`ImportAndExport-uploadedFiles ${uploadedFiles.length > 0 ? 'ImportAndExport-uploadedFiles--visible' : ''}`}>
                {renderUploadedFiles()}
              </div>
              <div className="ImportAndExport-buttonWrap">
                <button 
                  className="ImportAndExport-importButton Button--primary"
                  onClick={handleImportButton}
                >
                  Import
                </button>
              </div>
            </div>
          )}
  
          {!viewOnly && <hr className="ImportAndExport-divider" />}
  
          <div className="ImportAndExport-exportSection">
            <label className="ImportAndExport-label">Filename and Format</label>
            <div className="ImportAndExport-inputWrap">
              <form className="ImportAndExport-inputForm">
                <input
                  className="ImportAndExport-filenameInput"
                  value={fileName}
                  placeholder="Enter a filename..."
                  onChange={(e) => setFileName(e.target.value)}
                />
                <i className="fas fa-pen ImportAndExport-penIcon"></i>
              </form>
              <div className="ImportAndExport-fileType">
                <label
                  data-tooltip-content="For use in MetroDreamin', and a diverse range of applications."
                  onMouseEnter={(e) => e.currentTarget.classList.add('hover')}
                  onMouseLeave={(e) => e.currentTarget.classList.remove('hover')}
                  onClick={() => handleFileTypeChange('json')}
                >
                  <input
                    type="radio"
                    value="json"
                    checked={fileType === 'json'}
                    onChange={() => {}}
                  />
                  <i className={fileType === 'json' ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle'}></i> <span>JSON</span>
                </label>
                <label
                  data-tooltip-content="For use in map browsers, like Google Earth. (Large systems may be too big for Google My Maps)"
                  onMouseEnter={(e) => e.currentTarget.classList.add('hover')}
                  onMouseLeave={(e) => e.currentTarget.classList.remove('hover')}
                  onClick={() => handleFileTypeChange('kml')}
                >
                  <input
                    type="radio"
                    value="kml"
                    checked={fileType === 'kml'}
                    onChange={() => {}}
                  />
                  <i className={fileType === 'kml' ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle'}></i> <span>KML</span>
                </label>
              </div>
            </div>
            <div className="ImportAndExport-buttonWrap">
              <button className="ImportAndExport-exportButton Button--primary" onClick={handleExport}>
                Export
              </button>
            </div>
          </div>
        </div>
      );
    } else if (modalState === 'SelectLines') {
      return (
        <div className={`ImportAndExport-content ${fadeClass}`}>
          <div className="ImportAndExport-lineSelection">
            {/* Add line selection content here */}
          </div>
          <div className="ImportAndExport-buttonWrap ImportAndExport-nextPage">
            <button 
              className="ImportAndExport-backButton" 
              onClick={handleBackButton}
            >
              Back
            </button>
            <button className="ImportAndExport-addSelectionButton">
              Add Selection
            </button>
          </div>
        </div>
      );
    }
  };  
  
  return (
    <div className="ImportAndExport">
      <button className="ImportAndExport-openButton"
              data-tooltip-content="Import or export system data"
              onClick={() => setIsModalOpen(true)}>
        <i className="fas fa-download"></i>
      </button>
  
      {renderFadeWrap(
        prompt && (
          <Prompt
            message={prompt.message}
            denyText={prompt.denyText}
            confirmText={prompt.confirmText}
            denyFunc={prompt.denyFunc}
            confirmFunc={prompt.confirmFunc}
          />
        ),
        'prompt'
      )}
  
      <Modal 
        baseClass='ImportAndExport'
        open={isModalOpen}
        heading={<div className="ImportAndExport-heading">{modalState === 'ImportAndExport' ? 'Import and Export' : 'Select lines from file'}</div>}
        content={renderModalContent()}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}

function serializeToJSON(system) {

  function orderProperties(obj, order) {
    const orderedObj = {};
    Object.keys(obj).forEach(key => {
      const orderedSubObj = {};
      order.forEach(prop => {
        if (obj[key][prop] !== undefined) {
          orderedSubObj[prop] = obj[key][prop];
        }
      });
      orderedObj[key] = orderedSubObj;
    });
    return orderedObj;
  }

  const orderedSystem = {
    title: system.map.title,
    caption: system.map.caption,
    map: {
      stations: orderProperties(system.map.stations, ['isWaypoint', 'name', 'grade', 'lat', 'lng']),
      interchanges: orderProperties(system.map.interchanges, ['stationIds']),
      lineGroups: orderProperties(system.map.lineGroups, ['label']),
      lines: orderProperties(system.map.lines, ['name', 'color', 'mode', 'lineGroupId', 'stationIds', 'waypointOverrides'])
    },
    meta: {
      systemNumStr: system.meta.systemNumStr,
      nextStationId: system.meta.nextStationId,
      nextInterchangeId: system.meta.nextInterchangeId,
      nextLineGroupId: system.meta.nextLineGroupId,
      nextLineId: system.meta.nextLineId
    }
  };

  const indentationLevel = 2; // set stringify indentation level
  const jsonString = JSON.stringify(orderedSystem, null, indentationLevel);
  const spc = ' '.repeat(indentationLevel); // dynamic indentation spacing

  return jsonString                                                             // Affected objects, properties, and elements...
    // Remove newlines at the opening of objects and arrays
    .replace(/\{\n\s+"name"/g, '{ "name"')                                      // stations and lines
    .replace(/\{\n\s+"isWaypoint"/g, '{ "isWaypoint"')                          // stations
    .replace(/\{\n\s+"stationIds"/g, '{ "stationIds"')                          // interchanges and lines
    .replace(/\{\n\s+"label"/g, '{ "label"')                                    // linegroups
    .replace(/\[\n\s+"/g, '[ "')                                                // stationIds and waypointOverrides

    // Remove newlines between object properties and array elements
    .replace(/",\n\s+"/g, '", "')                                               // most properties and elements
    .replace(/,\n\s+"grade"/g, ', "grade"')                                     // stations
    .replace(/,\n\s+"lat"/g, ', "lat"')                                         // stations
    .replace(/,\n\s+"lng"/g, ', "lng"')                                         // stations
    .replace(/"\n\s+\],\n\s+"waypointOverrides"/g, '" ], "waypointOverrides"')  // lines

    // Remove newlines at the closing of objects and arrays
    .replace(/\n\s+\},/g, ' },')                                                // succeeded objects
    .replace(/\n\s+\}\s+\},/g, ` }\n${spc}${spc}},`)                            // last objects
    .replace(/\n\s+\]\s+\},/g, ' ] },')                                         // succeeded arrays         
    .replace(/\n\s+\]\s+\}/g, ' ] }')                                           // last arrays
    .replace(/\[\]\n\s+\}/g, '[] }')                                            // empty arrays

    // Correct unintended changes
    .replace('", "caption"', `",\n${spc}"caption"`)   // Fix caption property
    .replace('", "map"', `",\n${spc}"map"`)           // Fix map property
    .replace(/\}\n\s+\},\n\s+"meta"/, 
      `\n${spc}${spc}}\n${spc}},\n${spc}"meta"`)      // Fix meta property
    ;
}

function serializeToKML(system) {
  
  function sanitizeString(name) {
    if (!name) return '';
  
    return name
      .replace(/&/g, '&amp;')        // Ampersand
      .replace(/</g, '&lt;')         // Less-than
      .replace(/>/g, '&gt;')         // Greater-than
      .replace(/"/g, '&quot;')       // Double quote
      .replace(/'/g, '&apos;');      // Single quote
  }

  const sanitizedTitle = sanitizeString(system.map.title);
  const sanitizedDescription = sanitizeString(system.map.caption);

  const kmlHeader = generateKMLHeader(sanitizedTitle, sanitizedDescription);
  const kmlFooter = generateKMLFooter();
  const kmlStyles = generateKMLStyles(system);
  const kmlStations = generateKMLStations(system);
  const sortedKmlFolders = generateKMLFolders(system);

  return kmlHeader + kmlStyles + kmlStations + sortedKmlFolders + kmlFooter;

  function generateKMLHeader(title, description) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${title}</name>
    <description><![CDATA[${description}]]></description>
`;
  }

  function generateKMLFooter() {
    return `
  </Document>
</kml>`;
  }

  function generateKMLStyles(system) {
    return Object.values(system.map.lines)
      .filter(line => line.stationIds && line.stationIds.length > 0) // Skip lines without stationIds
      .map(line => {
        const lineColor = line.color.slice(1); // Remove '#' from the hex color
        const reversedColor = `ff${lineColor.slice(4, 6)}${lineColor.slice(2, 4)}${lineColor.slice(0, 2)}`; // Reverse color for KML
        const styleId = `line-${lineColor}-10666-nodesc`;

        return `
    <Style id="${styleId}">
      <LineStyle>
        <color>${reversedColor}</color>
        <width>6</width>
      </LineStyle>
    </Style>`;
      }).join('');
  }

  function generateKMLStations(system) {
    return `
  <Folder>
    <name>Stations</name>
    ${Object.values(system.map.stations)
      .filter(station => !station.isWaypoint)
      .map(station => {
        const sanitizedStationName = sanitizeString(station.name);
        const lng = station.lng.toFixed(7);
        const lat = station.lat.toFixed(7);
        return `
      <Placemark>
        <name>${sanitizedStationName}</name>
        <styleUrl>#icon-1899-0288D1-nodesc</styleUrl>
        <Point>
          <coordinates>${lng},${lat},0</coordinates>
        </Point>
      </Placemark>`;
      }).sort().join('')}
  </Folder>`;
  }

  function generateKMLFolders(system) {
    const linesByFolder = organizeLinesByFolder(system);

    return Object.entries(linesByFolder)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([folderName, placemarks]) => createFolderKML(folderName, placemarks))
      .join('');
  }

  function organizeLinesByFolder(system) {
    const linesByFolder = {};

    Object.values(system.map.lines)
      .filter(line => line.stationIds && line.stationIds.length > 0)
      .forEach(line => {
        const folderName = determineFolderName(line, system);
        if (!linesByFolder[folderName]) {
          linesByFolder[folderName] = [];
        }

        const lineKML = createLineKML(line, system);
        linesByFolder[folderName].push(lineKML);
      });

    return linesByFolder;
  }

  function createFolderKML(folderName, placemarks) {
    return `
  <Folder>
    <name>${folderName}</name>
    ${placemarks.sort().join('')}
  </Folder>`;
  }

  function createLineKML(line, system) {
    const sanitizedLineName = sanitizeString(line.name);
    const lineColor = line.color.slice(1);
    const styleUrl = `#line-${lineColor}-10666-nodesc`;

    const coordinates = line.stationIds.map(stationId => {
      const station = system.map.stations[stationId];
      if (!station) return null;

      const stationCoords = `${station.lng.toFixed(7)},${station.lat.toFixed(7)},0`;

      const waypointCoords = line.waypointOverrides?.[stationId]?.map(waypoint =>
        `${waypoint.lng.toFixed(7)},${waypoint.lat.toFixed(7)},0`
      ) || [];

      return [stationCoords, ...waypointCoords].join(' ');
    }).filter(coord => coord !== null).join(' ');

    return `
  <Placemark>
    <name>${sanitizedLineName}</name>
    <styleUrl>${styleUrl}</styleUrl>
    <LineString>
      <coordinates>${coordinates}</coordinates>
    </LineString>
  </Placemark>`;
  }

  function determineFolderName(line, system) {
    const lineGroup = system.map.lineGroups[line.lineGroupId];

    if (lineGroup) {
      return sanitizeString(lineGroup.label);
    } else if (line.mode) {
      const mode = LINE_MODES.find(m => m.key === line.mode);
      return mode ? sanitizeString(mode.label) : sanitizeString(DEFAULT_LINE_MODE);
    } else {
      return "Metro/rapid transit";
    }
  }
}