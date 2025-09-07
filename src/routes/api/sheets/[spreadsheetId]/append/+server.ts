import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const { spreadsheetId } = params;
	const authHeader = request.headers.get('authorization');
	
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return json({ error: 'Authorization header required' }, { status: 401 });
	}
	
	const accessToken = authHeader.substring(7);
	
	try {
		const requestData = await request.json();
		const { sheetName, values } = requestData;
		
		console.log('Received request data:', { sheetName, valuesLength: values?.length });
		
		if (!sheetName || !values || !Array.isArray(values)) {
			console.error('Invalid request data:', { sheetName, values });
			return json({ 
				error: 'Missing required fields: sheetName and values array' 
			}, { status: 400 });
		}

		// Step 0: 시트 존재 확인을 위한 간단한 범위 조회 시도
		console.log('Checking if sheet exists by testing small range...');
		const testRange = `${sheetName}!A1:A1`;
		const testUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(testRange)}`;
		
		const testResponse = await fetch(testUrl, {
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			}
		});
		
		if (!testResponse.ok) {
			const testErrorText = await testResponse.text();
			console.error('Sheet existence test failed:', {
				status: testResponse.status,
				statusText: testResponse.statusText,
				error: testErrorText,
				sheetName: sheetName
			});
			return json({ 
				error: `Sheet '${sheetName}' does not exist or cannot be accessed`,
				details: testErrorText,
				status: testResponse.status
			}, { status: testResponse.status });
		}
		
		console.log('Sheet existence confirmed for:', sheetName);

		// Step 1: Y27:AD126 범위에서 현재 데이터 가져오기
		const dataRange = `${sheetName}!Y27:AD126`;
		const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(dataRange)}`;
		
		console.log('Attempting to fetch data from sheet:', sheetName);
		console.log('Data range:', dataRange);
		console.log('API URL:', getUrl);
		
		const getResponse = await fetch(getUrl, {
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			}
		});
		
		if (!getResponse.ok) {
			const errorText = await getResponse.text();
			console.error('Failed to get current data:', {
				status: getResponse.status,
				statusText: getResponse.statusText,
				error: errorText,
				sheetName: sheetName,
				dataRange: dataRange
			});
			return json({ 
				error: 'Failed to get current data',
				details: errorText,
				sheetName: sheetName,
				status: getResponse.status
			}, { status: 500 });
		}
		
		const currentData = await getResponse.json();
		const currentValues = currentData.values || [];
		
		// Step 2: 빈 행 찾기 (Y 컬럼이 비어있는 첫 번째 행)
		let emptyRowIndex = -1;
		for (let i = 0; i < 100; i++) { // Y27부터 Y126까지 100행 확인
			if (i >= currentValues.length || !currentValues[i] || !currentValues[i][0]) {
				emptyRowIndex = i;
				break;
			}
		}
		
		if (emptyRowIndex === -1) {
			return json({ error: 'No empty rows available in Y27:AD126 range' }, { status: 400 });
		}
		
		// Step 3: 빈 행에 데이터 추가 (PUT 대신 values:append 방식 사용)
		const targetRow = 27 + emptyRowIndex; // Y27부터 시작하므로 27을 더함
		const updateRange = `${sheetName}!Y${targetRow}:AD${targetRow}`;
		const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`;
		
		console.log('Attempting to update range:', updateRange);
		console.log('Update URL:', updateUrl);
		console.log('Data to insert:', values);
		
		const updateBody = {
			values: [values],
			majorDimension: 'ROWS'
		};

		const updateResponse = await fetch(updateUrl, {
			method: 'PUT',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(updateBody)
		});

		if (!updateResponse.ok) {
			const errorText = await updateResponse.text();
			console.error('Google Sheets update error:', errorText);
			return json({
				error: `Failed to update row: ${updateResponse.statusText}`,
				details: errorText
			}, { status: updateResponse.status });
		}

		console.log('Data successfully added to row:', targetRow);
		console.log('Now attempting to sort the data...');
		
		// Step 4: 시트 ID 찾기 및 Y축(날짜) 기준 오름차순 정렬
		const sheetsInfoUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
		const sheetsInfoResponse = await fetch(sheetsInfoUrl, {
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			}
		});
		
		let sheetId = 0; // 기본값
		if (sheetsInfoResponse.ok) {
			const sheetsInfo = await sheetsInfoResponse.json();
			const targetSheet = sheetsInfo.sheets?.find((sheet: any) => 
				sheet.properties?.title === sheetName
			);
			if (targetSheet) {
				sheetId = targetSheet.properties.sheetId;
				console.log('Found sheet ID for sorting:', sheetId);
			}
		}
		
		const sortUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
		const sortBody = {
			requests: [{
				sortRange: {
					range: {
						sheetId: sheetId,
						startRowIndex: 26, // Y27 (0-based index이므로 26)
						endRowIndex: 126, // Y126까지
						startColumnIndex: 24, // Y 컬럼 (Y는 25번째 컬럼이므로 24)
						endColumnIndex: 30 // AD 컬럼까지 (AD는 30번째 컬럼이므로 29+1)
					},
					sortSpecs: [{
						dimensionIndex: 24, // Y 컬럼 기준 정렬
						sortOrder: 'ASCENDING'
					}]
				}
			}]
		};
		
		console.log('Sort request body:', JSON.stringify(sortBody, null, 2));
		
		const sortResponse = await fetch(sortUrl, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(sortBody)
		});
		
		let sorted = false;
		if (!sortResponse.ok) {
			const sortErrorText = await sortResponse.text();
			console.error('Sort failed:', {
				status: sortResponse.status,
				statusText: sortResponse.statusText,
				error: sortErrorText
			});
			// 정렬이 실패해도 데이터 추가는 성공했으므로 경고만 출력
		} else {
			console.log('Sort completed successfully');
			sorted = true;
		}
		
		return json({
			success: true,
			updatedRow: targetRow,
			updatedRange: updateRange,
			sorted: sorted
		});

	} catch (error) {
		console.error('Error appending row:', error);
		return json({
			error: 'Internal server error while appending row',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};