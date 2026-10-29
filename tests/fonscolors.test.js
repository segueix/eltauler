// Els cinc fons són independents del tauler i dels modes dia / ePaper.
const BG = require('../fonscolors');
const newStorage = (initial={})=>{
    const values = new Map(Object.entries(initial));
    return {
        getItem:key=>values.has(key)?values.get(key):null,
        setItem:(key,value)=>values.set(key,String(value)),
        values
    };
};
function harness(options={}) {
    const storage=options.storage||newStorage();
    const nodes={};
    const hooks={};
    const doc={
        documentElement:{setAttribute:(k,v)=>{doc.lastAttribute={k,v};}},
        readyState:options.readyState||'loading',
        addEventListener:(type,cb)=>{hooks[type]=cb;},
        getElementById:id=>nodes[id]||null
    };
    const makeNode=value=>({value,style:{},dataset:{},title:'',textContent:'',
        addEventListener(type,cb){this.callbacks=this.callbacks||{};this.callbacks[type]=cb;}});
    ['app-bg-select','app-bg-preview','app-bg-status'].forEach(id=>nodes[id]=makeNode(''));
    const listeners={};
    const host={document:doc,localStorage:storage,Math:{random:()=>options.random??0.4},
        addEventListener:(type,cb)=>{listeners[type]=cb;}};
    const controller=BG.start(host);
    if(hooks.DOMContentLoaded)hooks.DOMContentLoaded();
    return {controller,storage,doc,nodes,listeners,hooks};
}
describe('Fons de l’aplicació',()=>{
    test('exactament cinc colors, diferenciats i amb nom en català',()=>{
        expect(BG.COLORS).toHaveLength(5);
        expect(BG.IDS).toEqual(['blau','granat','verd','lila','groc']);
        expect(new Set(BG.COLORS.map(c=>c.hex)).size).toBe(5);
        BG.COLORS.forEach(c=>expect(c.hex).toMatch(/^#[0-9a-f]{6}$/));
    });
    test('en començar, el mode per defecte és aleatori, amb el color disponible abans del DOM',()=>{
        const x=harness();
        expect(x.controller.getMode()).toBe('aleatori');
        expect(x.doc.lastAttribute).toEqual({k:'data-app-bg',v:x.controller.getColor()});
        expect(BG.IDS).toContain(x.controller.getColor());
        expect(x.storage.values.get(BG.LAST_KEY)).toBe(x.controller.getColor());
        expect(x.nodes['app-bg-select'].value).toBe('aleatori');
        expect(x.nodes['app-bg-status'].textContent).toContain('Canviarà');
    });
    test('una obertura nova amb mode aleatori evita el mateix color anterior',()=>{
        const x=harness({storage:newStorage({[BG.LAST_KEY]:'blau'}),random:0});
        expect(x.controller.getColor()).not.toBe('blau');
        const later=harness({storage:x.storage,random:0});
        expect(later.controller.getColor()).not.toBe(x.controller.getColor());
    });
    test('el color fix persisteix, és immediat i no canvia en obrir',()=>{
        const x=harness();
        x.controller.selectMode('granat');
        expect(x.doc.lastAttribute.v).toBe('granat');
        expect(x.storage.getItem(BG.MODE_KEY)).toBe('granat');
        expect(x.nodes['app-bg-status'].textContent).toContain('Color fix: Granat');
        const y=harness({storage:x.storage,random:0.9});
        expect(y.controller.getColor()).toBe('granat');
    });
    test('el desplegable canvia el color sense recarregar ni generar un segon listener',()=>{
        const x=harness();
        const select=x.nodes['app-bg-select'];
        const cb=select.callbacks.change;
        select.value='lila';
        cb();
        expect(x.controller.getColor()).toBe('lila');
        x.controller.refreshUI();
        expect(select.callbacks.change).toBe(cb);
        expect(select.dataset.appBgReady).toBe('1');
    });
    test('en reactivar aleatori canvia al moment; en bfcache es torna a sortejar',()=>{
        const x=harness({random:0});
        x.controller.selectMode('verd');
        x.controller.selectMode('aleatori');
        expect(x.controller.getColor()).not.toBe('verd');
        const previous=x.controller.getColor();
        x.listeners.pageshow({persisted:false});
        expect(x.controller.getColor()).toBe(previous);
        x.listeners.pageshow({persisted:true});
        expect(x.controller.getColor()).not.toBe(previous);
    });
    test('les preferències corruptes recuperen aleatori i les absències de localStorage no trenquen la UI',()=>{
        expect(BG.normalizeMode('__proto__')).toBe('aleatori');
        expect(BG.resolve('unknown',null,()=>1)).toBe('groc');
        const x=harness({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});
        expect(BG.IDS).toContain(x.controller.getColor());
        expect(x.doc.lastAttribute.k).toBe('data-app-bg');
    });
    test('CSS i configuració: els modes especials conserven la seva aparença',()=>{
        const fs=require('fs'),path=require('path');
        const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
        expect(html).toContain('<script src="fonscolors.js?v=1.0.0"></script>');
        const jsPos=html.indexOf('fonscolors.js?v=1.0.0'),cssPos=html.indexOf('<style>');
        expect(jsPos).toBeLessThan(cssPos);
        expect((html.match(/<option value="(?:aleatori|blau|granat|verd|lila|groc)">/g)||[])).toHaveLength(6);
        expect((html.match(/html\[data-app-bg="(?:blau|granat|verd|lila|groc)"\] body:not\(\.day-mode\):not\(\.epaper-mode\)/g)||[])).toHaveLength(5);
    });
});
