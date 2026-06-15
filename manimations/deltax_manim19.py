from manim import *
import numpy as np

class Mruv_deltax(Scene):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # Configurações dos eixos
        self.x_range = [0, 10, 1]
        self.y_range = [0, 8, 1]
        self.x_length = 6
        self.y_length = 4
        self.axes_center = 2.5 * DOWN + 2 * LEFT

    def construct(self):
        self.add_title()
        self.show_function_graph()

    def add_title(self):
        title = Tex("Velocidade média e instantânea no gráfico de x vs t").scale(0.7)
        title.to_corner(UR)
        self.add(title)

    def show_function_graph(self):
        # Criar eixos
        axes = Axes(
            x_range=self.x_range,
            y_range=self.y_range,
            x_length=self.x_length,
            y_length=self.y_length,
            axis_config={"color": WHITE},
        ).move_to(self.axes_center)
        
        # Labels dos eixos
        x_label = axes.get_x_axis_label("t(s)")
        y_label = axes.get_y_axis_label("x(m)")
        
        def func(x):
            return 0.1 * x * x

        graph = axes.plot(func, x_range=[0, 9], color=PURPLE)
        graph_label = axes.get_graph_label(graph, label="x(t)", x_val=9)
        
        self.add(axes, x_label, y_label)

        # Value trackers para os pontos
        input_tracker = ValueTracker(3)
        input_tracker2 = ValueTracker(4)

        # Funções auxiliares para o ponto 1
        def get_x_value():
            return input_tracker.get_value()

        def get_y_value():
            return func(get_x_value())

        def get_x_point():
            return axes.coords_to_point(get_x_value(), 0)

        def get_y_point():
            return axes.coords_to_point(0, get_y_value())

        def get_graph_point():
            return axes.coords_to_point(get_x_value(), get_y_value())

        # Funções auxiliares para o ponto 2
        def get_x_value2():
            return input_tracker2.get_value()

        def get_y_value2():
            return func(get_x_value2())

        def get_x_point2():
            return axes.coords_to_point(get_x_value2(), 0)

        def get_y_point2():
            return axes.coords_to_point(0, get_y_value2())

        def get_graph_point2():
            return axes.coords_to_point(get_x_value2(), get_y_value2())

        def get_interm_point():
            return axes.coords_to_point(get_x_value2(), get_y_value())

        # Elementos visuais com always_redraw
        v_line = always_redraw(lambda: DashedLine(get_x_point(), get_graph_point(), stroke_width=2))
        h_line = always_redraw(lambda: DashedLine(get_graph_point(), get_y_point(), stroke_width=2))
        v_line2 = always_redraw(lambda: DashedLine(get_x_point2(), get_graph_point2(), stroke_width=2))
        h_line2 = always_redraw(lambda: DashedLine(get_graph_point2(), get_y_point2(), stroke_width=2))

        # Triângulos indicadores
        input_triangle = RegularPolygon(n=3, start_angle=PI/2).scale(0.1).set_fill(WHITE, 1).set_stroke(width=0)
        output_triangle = RegularPolygon(n=3, start_angle=0).scale(0.1).set_fill(WHITE, 1).set_stroke(width=0)
        input_triangle2 = RegularPolygon(n=3, start_angle=PI/2).scale(0.1).set_fill(WHITE, 1).set_stroke(width=0)
        output_triangle2 = RegularPolygon(n=3, start_angle=0).scale(0.1).set_fill(WHITE, 1).set_stroke(width=0)

        # Labels
        x_label = MathTex("t_1").scale(0.7)
        x_label2 = MathTex("t_2").scale(0.7)
        output_label = MathTex("x_1").scale(0.7)
        output_label2 = MathTex("x_2").scale(0.7)

        # Dots nos gráficos
        graph_dot = Dot(color=YELLOW)
        graph_dot2 = Dot(color=YELLOW)

        # Updaters para posicionamento
        input_triangle.add_updater(lambda m: m.move_to(get_x_point() + UP * 0.1))
        output_triangle.add_updater(lambda m: m.move_to(get_y_point() + RIGHT * 0.1))
        input_triangle2.add_updater(lambda m: m.move_to(get_x_point2() + UP * 0.1))
        output_triangle2.add_updater(lambda m: m.move_to(get_y_point2() + RIGHT * 0.1))

        x_label.add_updater(lambda m: m.next_to(input_triangle, DOWN, SMALL_BUFF))
        x_label2.add_updater(lambda m: m.next_to(input_triangle2, DOWN, SMALL_BUFF))
        output_label.add_updater(lambda m: m.next_to(output_triangle, LEFT, SMALL_BUFF))
        output_label2.add_updater(lambda m: m.next_to(output_triangle2, LEFT, SMALL_BUFF))

        graph_dot.add_updater(lambda m: m.move_to(get_graph_point()))
        graph_dot2.add_updater(lambda m: m.move_to(get_graph_point2()))

        # Retângulos para Δx e Δt
        def get_x_line():
            return Line(axes.coords_to_point(input_tracker.get_value(), 0),
                       axes.coords_to_point(input_tracker2.get_value(), 0))

        def get_y_line():
            return Line(axes.coords_to_point(0, func(input_tracker.get_value())),
                       axes.coords_to_point(0, func(input_tracker2.get_value())))

        x_rect = always_redraw(lambda: Rectangle(
            width=abs(get_x_line().get_length()),
            height=0.25,
            fill_color=YELLOW,
            fill_opacity=0.5,
            stroke_width=0
        ).move_to(get_x_line().get_center()))

        y_rect = always_redraw(lambda: Rectangle(
            height=abs(get_y_line().get_length()),
            width=0.25,
            fill_color=ORANGE,
            fill_opacity=0.5,
            stroke_width=0
        ).move_to(get_y_line().get_center()))

        # Labels para deltas
        delta_x = always_redraw(lambda: MathTex(r"\Delta t", color=YELLOW).scale(0.6).next_to(x_rect, DOWN))
        delta_y = always_redraw(lambda: MathTex(r"\Delta x", color=ORANGE).scale(0.6).next_to(y_rect, RIGHT))

        # Reta secante
        def get_secante_line():
            reference_line = Line(get_graph_point(), get_graph_point2())
            vector = reference_line.get_unit_vector()
            return Line(
                get_graph_point() - vector * 2,
                get_graph_point2() + vector * 2,
                color=BLUE
            )

        def get_secante_components():
            lh = Line(get_graph_point(), get_interm_point(), color=YELLOW)
            lv = Line(get_interm_point(), get_graph_point2(), color=ORANGE)
            sec = get_secante_line()
            
            dxl = MathTex(r"\Delta t", color=YELLOW).scale(0.7)
            dfl = MathTex(r"\Delta x", color=ORANGE).scale(0.7)
            
            dxl.next_to(lh, DOWN, buff=0.1)
            dfl.next_to(lv, RIGHT, buff=0.1)
            
            return VGroup(lh, lv, sec, dxl, dfl)

        secante = always_redraw(get_secante_components)

        # Animação principal
        self.play(Create(graph))
        self.wait(3)

        # Mostrar primeiro ponto
        self.play(
            DrawBorderThenFill(input_triangle),
            Write(x_label),
            Create(v_line),
            GrowFromCenter(graph_dot),
            Create(h_line),
            Write(output_label),
            DrawBorderThenFill(output_triangle),
        )
        self.wait(2)

        # Animar primeiro ponto
        self.play(
            input_tracker.animate.set_value(8),
            run_time=6,
            rate_func=there_and_back
        )
        self.wait(3)

        # Mostrar equação velocidade média
        texto2 = MathTex(r"v_m = ", r"\frac{\Delta x}{\Delta t}")
        texto2[0].set_color(BLUE)
        texto2[1].set_color(ORANGE)
        texto2.to_corner(UR).shift(2*DOWN)
        self.play(Write(texto2))
        self.wait(3)

        # Mostrar segundo ponto
        self.play(
            DrawBorderThenFill(input_triangle2),
            Write(x_label2),
            Create(v_line2),
            Create(h_line2),
            GrowFromCenter(graph_dot2),
            DrawBorderThenFill(output_triangle2),
            Write(output_label2),
        )
        self.wait(2)

        # Mostrar retângulos delta
        self.play(
            Create(x_rect),
            Create(y_rect),
            Write(delta_x),
            Write(delta_y)
        )
        self.wait(2)

        # Animar pontos juntos
        self.play(
            input_tracker.animate.set_value(8),
            input_tracker2.animate.set_value(9),
            run_time=6,
            rate_func=smooth
        )
        self.wait(3)

        self.play(
            input_tracker.animate.set_value(4),
            input_tracker2.animate.set_value(5),
            run_time=6,
            rate_func=linear
        )
        self.wait(3)

        # Mostrar reta secante
        self.play(FadeOut(texto2))
        self.wait(2)
        
        self.play(Create(secante))
        self.wait(3)

        # Animar com reta secante
        self.play(
            input_tracker.animate.set_value(8),
            input_tracker2.animate.set_value(9),
            run_time=6,
            rate_func=there_and_back
        )
        self.wait()

        self.play(
            input_tracker.animate.set_value(4),
            input_tracker2.animate.set_value(7),
            run_time=6,
            rate_func=linear
        )
        self.wait()

        # Remover retângulos
        self.play(
            FadeOut(x_rect),
            FadeOut(y_rect),
            FadeOut(delta_x),
            FadeOut(delta_y)
        )
        self.wait(3)

        # Equações da inclinação
        texto3 = MathTex("=", r"\frac{\text{vertical}}{\text{horizontal}}")
        texto3[0].set_color(BLUE)
        texto3[1].set_color(ORANGE)
        
        t = Tex("Inclinação").set_color(BLUE)
        
        eq1 = VGroup(t, texto3).arrange(RIGHT).to_corner(UR).shift(DOWN)
        self.play(Write(eq1))
        self.wait(3)

        # Animar inclinação
        self.play(
            input_tracker.animate.set_value(4),
            input_tracker2.animate.set_value(5.5),
            run_time=3,
            rate_func=there_and_back
        )
        self.wait()

        # Transformações finais
        texto4 = MathTex("=", r"\frac{\Delta x}{\Delta t}")
        texto4[0].set_color(BLUE)
        texto4[1].set_color(ORANGE)
        
        eq2 = VGroup(t.copy(), texto4).arrange(RIGHT).to_corner(UR).shift(DOWN)
        
        self.play(ReplacementTransform(eq1, eq2))
        self.wait(3)

        # Velocidade média final
        texto5 = MathTex("v_m").set_color(BLUE)
        eq3 = VGroup(texto5, texto4.copy()).arrange(RIGHT).to_corner(UR).shift(DOWN)
        
        self.play(ReplacementTransform(eq2, eq3))
        self.wait(3)

        # Transição para tangente
        self.play(
            input_tracker.animate.set_value(8),
            input_tracker2.animate.set_value(9),
            run_time=4,
            rate_func=there_and_back
        )

        # Aproximar pontos para mostrar tangente
        self.play(
            input_tracker2.animate.set_value(4.01),
            run_time=6,
            rate_func=linear
        )
        self.wait()

        self.play(
            input_tracker.animate.set_value(0),
            input_tracker2.animate.set_value(0.01),
            run_time=2,
            rate_func=smooth
        )

        self.play(
            input_tracker.animate.set_value(9),
            input_tracker2.animate.set_value(9.01),
            run_time=6,
            rate_func=there_and_back
        )
        self.wait()


class PlotTwoGraphsAtOnce(Scene):
    def construct(self):
        # Primeiro gráfico (cima)
        axes1 = Axes(
            x_range=[0, 7, 1],
            y_range=[0, 40, 10],
            x_length=6,
            y_length=3,
            axes_color=GRAY,
        ).move_to(-0.5 * DOWN + 3 * LEFT)
        
        graph_up = axes1.plot(lambda x: x**2, color=GOLD_A, x_range=[0, 3])
        f1 = MathTex(r"f(x) = x^2", color=GOLD_A).scale(0.7)
        f1.next_to(axes1.coords_to_point(3, 9), RIGHT + UP)

        # Segundo gráfico (baixo)
        axes2 = Axes(
            x_range=[0, 7, 1],
            y_range=[0, 40, 10],
            x_length=6,
            y_length=3,
            axes_color=GRAY,
        ).move_to(3.5 * DOWN + 3 * LEFT)
        
        graph_down = axes2.plot(lambda x: x**3, color=BLUE_D, x_range=[0, 3])
        graphs = VGroup(axes1, axes2, graph_up, graph_down)
        
        f2 = MathTex(r"f(x) = x^3", color=BLUE_D).scale(0.7)
        f2.next_to(axes2.coords_to_point(3, 27), RIGHT + UP)
        
        self.play(Create(graphs), run_time=2)
        self.play(Create(f1), Create(f2))
        self.wait(3)