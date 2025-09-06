import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, params, request }) => {
    const { spreadsheetId } = params;
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
        // AA22:AA23 셀 범위 - 정산 금액 정보
        const settlementRange = `${sheetName}!AA22:AA23`;
        const encodedRange = encodeURIComponent(settlementRange);
        
        console.log('Settlement API Request Details:', {
            spreadsheetId,
            sheetName,
            settlementRange,
            encodedRange
        });
        
        // Google Sheets API로 정산 금액 데이터 가져오기
        const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`;
        console.log('Settlement Values API URL:', valuesUrl);
        
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
                error: `Failed to fetch settlement data from Google Sheets: ${sheetsResponse.statusText}`,
                details: errorText
            }, { status: sheetsResponse.status });
        }
        
        const data = await sheetsResponse.json();
        console.log('Settlement API Response received:', { 
            hasValues: !!data.values,
            valueCount: data.values?.length || 0,
            range: data.range 
        });
        
        const values = data.values || [];
        
        // AA22와 AA23 값 추출
        const seoEunAmount = values.length > 0 && values[0] && values[0][0] ? values[0][0] : '0';
        const kiSoonAmount = values.length > 1 && values[1] && values[1][0] ? values[1][0] : '0';
        
        // 숫자 값으로 변환 (문자열에서 숫자만 추출)
        function parseAmountValue(value: string): number {
            if (!value || typeof value !== 'string') return 0;
            const numericValue = parseFloat(value.replace(/[^\d.-]/g, ''));
            return isNaN(numericValue) ? 0 : numericValue;
        }
        
        const seoEunAmountNum = parseAmountValue(seoEunAmount);
        const kiSoonAmountNum = parseAmountValue(kiSoonAmount);
        
        return json({
            range: settlementRange,
            settlement: {
                seoEun: {
                    label: '서은 정산 금액',
                    amount: seoEunAmountNum,
                    formattedAmount: seoEunAmountNum.toLocaleString('ko-KR')
                },
                kiSoon: {
                    label: '기순 정산 금액',
                    amount: kiSoonAmountNum,
                    formattedAmount: kiSoonAmountNum.toLocaleString('ko-KR')
                },
                total: {
                    amount: seoEunAmountNum + kiSoonAmountNum,
                    formattedAmount: (seoEunAmountNum + kiSoonAmountNum).toLocaleString('ko-KR')
                }
            },
            metadata: {
                spreadsheetId,
                sheetName,
                actualRange: data.range || settlementRange,
                hasData: values.length > 0
            }
        });
        
    } catch (error) {
        console.error('Error fetching settlement data:', error);
        return json({ 
            error: 'Internal server error while fetching settlement data',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
};