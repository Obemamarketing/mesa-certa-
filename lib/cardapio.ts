// Cardápio do restaurante, mostrado em /cardapio. Para outro restaurante (ou
// quando o ZéPelin mudar o cardápio), mexe só aqui.
//
// Transcrito do cardápio impresso do ZéPelin. O impresso não traz preços, então
// a página também não traz.

export type OpcaoDoItem = { nome: string; descricao: string };

export type ItemDoCardapio = {
  nome: string;
  /** Complemento que vai junto do nome: "(sanduba)", "long neck", "600 ml"… */
  detalhe?: string;
  descricao?: string;
  /** Quem criou o drink. */
  autor?: string;
  /** Sabores ou versões, cada um com a sua descrição (os pastéis). */
  opcoes?: OpcaoDoItem[];
};

export type GrupoDoCardapio = { titulo?: string; itens: ItemDoCardapio[] };

export type SecaoDoCardapio = {
  id: string;
  titulo: string;
  /** Comida ou bebida: no computador, cada tipo fica numa coluna. */
  tipo: "comida" | "bebida";
  /** Lista corrida, só com os nomes (doses, cervejas, refris). */
  compacta?: boolean;
  grupos: GrupoDoCardapio[];
};

export const cardapio: SecaoDoCardapio[] = [
  {
    id: "petiscos",
    titulo: "Petiscos",
    tipo: "comida",
    grupos: [
      {
        itens: [
          { nome: "Caldinho de feijão", descricao: "Caldo de feijão clássico, cebolete e bacon em cubos bem fritinho." },
          { nome: "Polenta caseira", descricao: "Polenta caseira cremosa por dentro e crocante por fora. Maionese cítrica." },
          { nome: "Batata frita", descricao: "Batata corte rústico (500 g) e maionese de bacon." },
          { nome: "Torresmo campeão", descricao: "Barriga de porco bem fritinha + 1 dose de cachaça da boa." },
          { nome: "Aipim com torresmo", descricao: "Aipim crocante com pancetta marinada bem fritinha." },
          {
            nome: "Pastel",
            detalhe: "que o dono pediu!",
            opcoes: [
              { nome: "Carne", descricao: "carne moída, molho de tomate e especiarias" },
              { nome: "Frango", descricao: "frango desfiado, requeijão cremoso e cheiro-verde" },
              { nome: "Carbonara", descricao: "ovo cozido, queijo e bacon frito" },
            ],
          },
          {
            nome: "Pastel",
            detalhe: "que o chefe ostentação criou!",
            opcoes: [
              { nome: "Costela", descricao: "costela de boi desfiada e cebola confitada" },
              { nome: "Camarão", descricao: "camarão em base cremosa de bechamel e toque cítrico" },
              { nome: "Queijo", descricao: "queijo gouda e parmesão meia cura" },
            ],
          },
          {
            nome: "Minininhos",
            descricao:
              "O petisco da casa! Pequenos ninhos de batata frita recheados: requeijão e bacon; estrogonofe; cheddar e cebola; mexicano.",
          },
          { nome: "Tilapinha maravilha", descricao: "Tiras de tilápia ao limão e especiarias, empanadas no trigo, com molho tártaro." },
          { nome: "Frango frito", descricao: "Coxinha da asa de frango marinada, temperada e frita na hora." },
          { nome: "Bolinho Bete Raiz", descricao: "Bolinho de massa de beterraba recheado com alho-poró e especiarias." },
          { nome: "Bolim de carne", descricao: "Bolinho de carne moída frito na hora e molhinho de pimenta." },
          { nome: "Carne de onça", descricao: "Carne de boi picada, cebola e especiarias, broa preta e mostarda escura." },
          { nome: "Mignon Zépe", descricao: "Cubinhos de filé mignon ao creme de gorgonzola, batatas fritas e pão em fatias." },
          { nome: "Choripan", detalhe: "sanduba", descricao: "Pão francês chapeado com linguiça toscana, mostarda e chimichurri." },
          { nome: "Ambulante de mignon", detalhe: "sanduba", descricao: "Pão baguete, tiras de filé mignon, queijo derretido e cebolete." },
        ],
      },
    ],
  },
  {
    id: "sobremesas",
    titulo: "Sobremesas",
    tipo: "comida",
    grupos: [
      {
        itens: [
          { nome: "Banana Foster", descricao: "Banana flambada na manteiga e açúcar mascavo, com sorvete de baunilha." },
          { nome: "Brownie", descricao: "Brownie de chocolate com calda de chocolate e sorvete de creme." },
        ],
      },
    ],
  },
  {
    id: "drinks",
    titulo: "Drinks",
    tipo: "bebida",
    grupos: [
      {
        titulo: "Os drinks que só tem aqui!",
        itens: [
          { nome: "Épa!", autor: "Marcelo Adidio Dalmazo", descricao: "Vodka, cítricos, gengibre e hortelã coados, espumante e gelo." },
          { nome: "Tupinambá", autor: "Marcelo Adidio Dalmazo", descricao: "Rum, suco de limão, abacaxi e açúcar coados, splash de cassis e gelo." },
          { nome: "Suçuarana", autor: "Marcelo Adidio Dalmazo", descricao: "Rum, licor de amêndoas, limão-siciliano e maracujá coados e gelo (leva clara de ovo)." },
          { nome: "Friquique", autor: "Cialberth de Paula", descricao: "Saquê, martini rosato e polpa de morango." },
          { nome: "Cingapura Slim", autor: "Joel Arenas", descricao: "Gin, licor de cereja, licor de laranja, licor de whisky, abacaxi e grenadine." },
          { nome: "Paixão Púrpura", autor: "Joel Arenas", descricao: "Gin, amoras frescas, limão, curaçao e grenadine." },
          { nome: "Mojito Tropical", autor: "Joel Arenas", descricao: "Rum, maracujá e hortelã, soda limonada." },
          { nome: "Dona7", autor: "Bruno Miller", descricao: "Vodka, xarope de pimenta, coco e morango, leite condensado." },
        ],
      },
      {
        titulo: "Os clássicos da coquetelaria!",
        itens: [
          { nome: "Alexander", descricao: "Conhaque, licor de cacau e creme de leite." },
          { nome: "Piña Colada", descricao: "Rum, suco de abacaxi, creme de coco e gelo." },
          { nome: "Caipirinha", detalhe: "vodka, cachaça ou saquê", descricao: "Limão, morango ou maracujá." },
          { nome: "Caipirão na caneca de chope", detalhe: "vodka, cachaça ou saquê", descricao: "Limão, morango ou maracujá." },
        ],
      },
    ],
  },
  {
    id: "doses",
    titulo: "Doses",
    tipo: "bebida",
    compacta: true,
    grupos: [
      {
        itens: [
          { nome: "Cachaça da casa" },
          { nome: "Cachaça de jambu" },
          { nome: "Smirnoff ou Steinhaeger" },
          { nome: "Bacardi, Campari ou saquê" },
          { nome: "Gin Tanqueray" },
          { nome: "Tequila" },
          { nome: "Jägermeister ou Licor 43" },
          { nome: "Vodka Absolut" },
          { nome: "Whisky Passport" },
          { nome: "Whisky Johnnie Walker Red" },
          { nome: "Jack Daniel's" },
          { nome: "Whisky Chivas 12 anos" },
        ],
      },
    ],
  },
  {
    id: "cervejas",
    titulo: "Cervejas",
    tipo: "bebida",
    compacta: true,
    grupos: [
      {
        itens: [
          { nome: "Amstel Ultra", detalhe: "long neck" },
          { nome: "Heineken", detalhe: "long neck · tem zero também" },
          { nome: "Smirnoff Ice" },
          { nome: "Chope Amstel" },
          { nome: "Baden Baden", detalhe: "600 ml · IPA, Peach, Witbier" },
          { nome: "Spaten", detalhe: "600 ml" },
          { nome: "Heineken", detalhe: "600 ml" },
          { nome: "Original", detalhe: "600 ml" },
          { nome: "Amstel", detalhe: "litro" },
          { nome: "Brahma", detalhe: "litro" },
        ],
      },
    ],
  },
  {
    id: "refris-e-sucos",
    titulo: "Refris e sucos",
    tipo: "bebida",
    compacta: true,
    grupos: [
      {
        itens: [
          { nome: "Água mineral" },
          { nome: "Guaraná, soda ou tônica", detalhe: "lata" },
          { nome: "Coca-Cola", detalhe: "garrafinha" },
          { nome: "Limonada suíça" },
          { nome: "Suco de maracujá" },
          { nome: "Red Bull" },
        ],
      },
    ],
  },
];
