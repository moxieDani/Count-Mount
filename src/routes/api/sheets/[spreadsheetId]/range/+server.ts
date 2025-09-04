import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, params, request }) => {
    const { spreadsheetId } = params;
    const dataRange = url.searchParams.get('range') || 'Y27:AD126';
    const headerRange = url.searchParams.get('headerRange') || 'Y26:AD26';
    const sheetName = url.searchParams.get('sheetName');
    
    // Authorization 헤더에서 액세스 토큰 추출
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }
    
    const accessToken = authorization.replace('Bearer ', '');
    
    if (!spreadsheetId || !sheetName) {
        return json({ 
            error: 'Missing required parameters: spreadsheetId and sheetName' 
        }, { status: 400 });
    }
    
    try {
        // 헤더와 데이터를 동시에 가져오기 (Y26:AD126 형태로)
        const startCol = headerRange.split(':')[0]; // Y26
        const endCol = dataRange.split(':')[1]; // AD126
        const batchRange = `${sheetName}!${startCol}:${endCol}`;
        const encodedRange = encodeURIComponent(batchRange);
        
        console.log('API Request Details:', {
            spreadsheetId,
            sheetName,
            batchRange,
            encodedRange,
            headerRange,
            dataRange
        });
        
        // 우선 기본 values API로 데이터 가져오기
        const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`;
        console.log('Values API URL:', valuesUrl);
        
        const sheetsResponse = await fetch(valuesUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            }
        });
        
        if (!sheetsResponse.ok) {
            const errorText = await sheetsResponse.text();
            console.error('Google Sheets API error:', {
                status: sheetsResponse.status,
                statusText: sheetsResponse.statusText,
                error: errorText
            });
            
            return json({ 
                error: `Failed to fetch data from Google Sheets: ${sheetsResponse.statusText}`,
                details: errorText
            }, { status: sheetsResponse.status });
        }
        
        const data = await sheetsResponse.json();
        console.log('API Response received:', { 
            hasValues: !!data.values,
            valueCount: data.values?.length || 0,
            range: data.range 
        });
        
        const allValues = data.values || [];
        
        // 헤더와 데이터 분리
        const headerRow = allValues.length > 0 ? allValues[0] : [];
        const dataRows = allValues.slice(1);
        
        // 빈 행과 빈 값을 필터링하는 함수
        function filterNonEmptyData(values: string[][]) {
            if (!values || values.length === 0) return [];
            
            return values
                .map(row => row || [])
                .filter(row => {
                    return row.some(cell => cell !== undefined && cell !== null && cell.toString().trim() !== '');
                });
        }
        
        const filteredValues = filterNonEmptyData(dataRows);
        
        // 헤더 정보 처리
        const tableHeaders = headerRow.map(cell => 
            cell !== undefined && cell !== null ? cell.toString().trim() : ''
        );
        
        // 색상 정보를 가져오기 위한 별도 API 호출
        let cellFormats: any[][] = [];
        let headerFormats: any[] = [];
        
        try {
            console.log('Fetching format information...');
            const formatUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${encodedRange}&includeGridData=true`;
            console.log('Format API URL:', formatUrl);
            
            const formatResponse = await fetch(formatUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                }
            });
            
            if (formatResponse.ok) {
                const formatData = await formatResponse.json();
                console.log('Format data received:', !!formatData.sheets);
                
                if (formatData.sheets && formatData.sheets[0] && formatData.sheets[0].data && formatData.sheets[0].data[0]) {
                    const gridData = formatData.sheets[0].data[0];
                    const rowData = gridData.rowData || [];
                    
                    console.log('Processing format data for', rowData.length, 'rows');
                    
                    // RGB를 HEX로 변환하는 함수
                    function rgbToHex(color: any): string | null {
                        if (!color) return null;
                        
                        const r = Math.round((color.red || 0) * 255);
                        const g = Math.round((color.green || 0) * 255);
                        const b = Math.round((color.blue || 0) * 255);
                        
                        // 기본 검은색(0,0,0)은 null로 처리
                        if (r === 0 && g === 0 && b === 0) return null;
                        
                        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                    }
                    
                    // 각 행의 포맷 정보 추출
                    const allFormats: any[][] = [];
                    rowData.forEach((row: any) => {
                        const rowFormats: any[] = [];
                        if (row.values) {
                            row.values.forEach((cell: any) => {
                                const formatInfo: any = {
                                    textColor: null,
                                    backgroundColor: null
                                };
                                
                                // effectiveFormat에서 색상 정보 추출
                                if (cell.effectiveFormat) {
                                    if (cell.effectiveFormat.textFormat && cell.effectiveFormat.textFormat.foregroundColor) {
                                        formatInfo.textColor = rgbToHex(cell.effectiveFormat.textFormat.foregroundColor);
                                    }
                                    if (cell.effectiveFormat.backgroundColor) {
                                        formatInfo.backgroundColor = rgbToHex(cell.effectiveFormat.backgroundColor);
                                    }
                                }
                                
                                rowFormats.push(formatInfo);
                            });
                        }
                        allFormats.push(rowFormats);
                    });
                    
                    // 헤더와 데이터 포맷 분리
                    headerFormats = allFormats.length > 0 ? allFormats[0] : [];
                    const dataFormats = allFormats.slice(1);
                    
                    // 빈 행이 필터링된 데이터와 매칭되는 포맷 정보만 추출
                    cellFormats = [];
                    let formatIndex = 0;
                    
                    dataRows.forEach((row, rowIndex) => {
                        const hasData = row.some((cell: any) => 
                            cell !== undefined && cell !== null && cell.toString().trim() !== ''
                        );
                        
                        if (hasData && formatIndex < dataFormats.length) {
                            cellFormats.push(dataFormats[formatIndex]);
                        }
                        formatIndex++;
                    });
                    
                    console.log('Format extraction completed:', {
                        headerFormats: headerFormats.length,
                        cellFormats: cellFormats.length,
                        dataRows: filteredValues.length
                    });
                }
            } else {
                console.warn('Format API failed:', formatResponse.status, formatResponse.statusText);
            }
        } catch (formatError) {
            console.error('Error fetching format data:', formatError);
        }
        
        // 포맷 정보가 없으면 빈 배열로 초기화
        if (cellFormats.length === 0) {
            cellFormats = filteredValues.map(row => 
                row.map(() => ({ textColor: null, backgroundColor: null }))
            );
        }
        
        if (headerFormats.length === 0) {
            headerFormats = tableHeaders.map(() => ({ textColor: null, backgroundColor: null }));
        }
        
        return json({
            range: batchRange,
            values: filteredValues,
            headers: tableHeaders,
            cellFormats: cellFormats,
            headerFormats: headerFormats,
            metadata: {
                spreadsheetId,
                sheetName,
                requestedDataRange: dataRange,
                requestedHeaderRange: headerRange,
                actualRange: data.range || batchRange,
                hasData: filteredValues.length > 0,
                hasHeaders: tableHeaders.some(h => h !== '')
            }
        });
        
    } catch (error) {
        console.error('Error fetching sheet data:', error);
        return json({ 
            error: 'Internal server error while fetching sheet data',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
};